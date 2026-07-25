export type ColorTheme = 'light' | 'dark';

export const getChartTheme = (theme: ColorTheme) => {
  const dark = theme === 'dark';

  return {
    text: dark ? '#e7efed' : '#162321',
    textStrong: dark ? '#f2f7f5' : '#435450',
    muted: dark ? '#9fb0ac' : '#70807c',
    grid: dark ? 'rgba(170, 197, 191, 0.14)' : '#e7eeec',
    axis: dark ? 'rgba(170, 197, 191, 0.18)' : 'rgba(25, 75, 70, 0.14)',
    tooltipBackground: dark ? 'rgba(21, 32, 30, 0.98)' : 'rgba(255, 255, 255, 0.98)',
    tooltipBorder: dark ? 'rgba(170, 197, 191, 0.18)' : 'rgba(25, 75, 70, 0.14)',
    tooltipShadow: dark
      ? 'box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);'
      : 'box-shadow: 0 8px 24px rgba(20, 51, 47, 0.1);',
    pointBorder: dark ? '#172522' : '#ffffff',
    zoomBackground: dark ? '#223330' : '#e7eeec',
    zoomFill: dark ? 'rgba(89, 159, 148, 0.22)' : 'rgba(40, 127, 130, 0.15)'
  };
};
