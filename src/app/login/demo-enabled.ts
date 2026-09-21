/** Whether the shared demo account block is shown on the login screen. */
export function getDemoEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED === 'true');
}
