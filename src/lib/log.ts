export function log(component: string, message: string): void {
  console.log(`${new Date().toISOString()} [${component}] ${message}`);
}
