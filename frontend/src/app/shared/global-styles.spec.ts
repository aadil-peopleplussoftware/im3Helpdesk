declare global {
  interface ImportMeta {
    glob: <T = unknown>(
      pattern: string,
      options?: { query?: string; import?: string; eager?: boolean }
    ) => Record<string, T>;
  }
}

describe('Global styles cleanup', () => {
  it('should keep theme definitions only in ui-tokens.scss', () => {
    const files = import.meta.glob('/src/styles.scss', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;

    expect(Object.keys(files)).toEqual(['/src/styles.scss']);
    const styles = files['/src/styles.scss'];

    expect(styles).not.toContain('theme-blue');
    expect(styles).not.toContain('theme-green');
    expect(styles).not.toContain('theme-purple');
    expect(styles).not.toContain('theme-orange');
    expect(styles).not.toContain('theme-navy');
    expect(styles).not.toContain('theme-rose');
    expect(styles).not.toContain('theme-teal');
    expect(styles).not.toContain('theme-amber');
    expect(styles).not.toContain('theme-slate');
  });
});
