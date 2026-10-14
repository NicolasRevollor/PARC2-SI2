const viteEnv = (import.meta as any).env;

export const environment = {
  production: viteEnv.PROD,
  apiUrl: viteEnv.VITE_API_URL || (viteEnv.PROD
    ? 'https://primparcsi2.onrender.com'
    : 'http://localhost:8000'),
  stripePublishableKey: viteEnv.VITE_STRIPE_PUBLISHABLE_KEY || '',
};
