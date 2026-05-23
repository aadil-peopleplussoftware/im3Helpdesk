declare global {
  interface ImportMeta {
    glob: <T = unknown>(
      pattern: string,
      options?: { query?: string; import?: string; eager?: boolean }
    ) => Record<string, T>;
  }
}

describe('UI style consistency', () => {
  it('should not use hardcoded hex colors in app scss files', () => {
    const files = import.meta.glob('/src/app/**/*.scss', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(0);
    const offenders: string[] = [];
    const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;

    for (const [file, raw] of Object.entries(files)) {
      const matches = raw.match(hexRegex);
      if (!matches?.length) continue;

      for (const hex of matches) {
        offenders.push(`${file} -> ${hex}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
