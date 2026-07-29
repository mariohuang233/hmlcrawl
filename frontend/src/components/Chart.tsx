import React from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  DataZoomComponent,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
]);

type ChartProps = Omit<React.ComponentProps<typeof ReactEChartsCore>, 'echarts'> & {
  ariaLabel: string;
  summary?: string;
};

const Chart: React.FC<ChartProps> = React.memo(({ ariaLabel, summary, ...props }) => (
  <>
    <div className="accessible-chart" role="img" aria-label={ariaLabel}>
      <ReactEChartsCore echarts={echarts} {...props} />
    </div>
    <p className="sr-only">{summary || ariaLabel}</p>
  </>
));

export default Chart;
