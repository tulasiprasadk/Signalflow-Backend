Deploying the backend to Fly

1. Install flyctl: https://fly.io/docs/hands-on/install-flyctl/

2. Login and launch (from `backend-clean-temp`):

```bash
cd backend-clean-temp
fly auth login
fly launch --name signalflow-backend --no-deploy
```

3. Set required secrets (replace values):

```bash
fly secrets set DATABASE_URL="postgresql://USER:PASS@HOST:5432/postgres?schema=public&sslmode=require" JWT_SECRET="your_jwt_secret"
```

4. Deploy:

```bash
fly deploy
```

5. Run migrations on the Fly instance:

```bash
fly ssh console -C 'bash -lc "cd /app && npx prisma migrate deploy"'
```

6. Update frontend `BACKEND_URL` env to the Fly app URL and redeploy the frontend.
