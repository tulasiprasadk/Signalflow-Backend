const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { randomBytes, scryptSync, timingSafeEqual } = require('crypto');

const prisma = new PrismaClient();

function getJwtSecret() {
  return process.env.JWT_SECRET || 'growthinfra-dev-secret';
}

function getAllowedOrigin(req) {
  const configured = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '';
  const configuredOrigins = String(configured)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const requestOrigin = req.headers.origin || '';
  if (requestOrigin && configuredOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return configuredOrigins[0] || '*';
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, storedDerived] = String(storedHash || '').split(':');
  if (!salt || !storedDerived) return false;

  const incoming = scryptSync(password, salt, 64);
  const existing = Buffer.from(storedDerived, 'hex');
  if (incoming.length !== existing.length) return false;

  return timingSafeEqual(incoming, existing);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    getJwtSecret(),
    { expiresIn: '7d' },
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return '';
  return authorization.slice(7);
}

async function handleSignup(req, res) {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !email.includes('@')) {
    return json(res, 400, { error: 'Valid email is required' });
  }

  if (password.length < 6) {
    return json(res, 400, { error: 'Password must be at least 6 characters' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return json(res, 409, { error: 'User already exists' });
  }

  const orgLabel = email.split('@')[0] || 'growthinfra';
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password: hashPassword(password),
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: `${orgLabel} organization`,
        description: 'Default organization',
        category: 'general',
        location: 'remote',
        website: '',
      },
    });

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'owner',
      },
    });

    return user;
  });

  return json(res, 200, {
    token: signToken(created),
    user: { id: created.id, email: created.email },
  });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !password) {
    return json(res, 400, { error: 'Email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.password)) {
    return json(res, 401, { error: 'Invalid email or password' });
  }

  return json(res, 200, {
    token: signToken(user),
    user: { id: user.id, email: user.email },
  });
}

async function handleMe(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    return json(res, 401, { error: 'Missing token' });
  }

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (error) {
    return json(res, 401, { error: 'Invalid token' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    return json(res, 401, { error: 'User not found' });
  }

  return json(res, 200, {
    user: { id: user.id, email: user.email },
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/health') {
      return json(res, 200, {
        status: 'ok',
        service: 'backend',
        time: new Date().toISOString(),
      });
    }

    if (req.method === 'POST' && path === '/api/auth/signup') {
      return handleSignup(req, res);
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      return handleLogin(req, res);
    }

    if (req.method === 'GET' && path === '/api/auth/me') {
      return handleMe(req, res);
    }

    return json(res, 404, { error: 'Not found', path });
  } catch (error) {
    return json(res, 500, {
      error: 'server_error',
      message: error.message || String(error),
    });
  }
};
