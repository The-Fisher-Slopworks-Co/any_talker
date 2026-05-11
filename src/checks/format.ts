export function formatTemplate(
  template: string,
  vars: { name: string; count: number },
): string {
  return template
    .replaceAll("{name}", vars.name)
    .replaceAll("{count}", String(vars.count));
}
