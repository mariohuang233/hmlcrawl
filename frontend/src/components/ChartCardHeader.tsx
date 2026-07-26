import React from 'react';

interface ChartCardHeaderProps {
  title: string;
  description: string;
  value: string;
}

const ChartCardHeader: React.FC<ChartCardHeaderProps> = ({ title, description, value }) => (
  <header className="chart-card-header">
    <div className="chart-card-copy">
      <h2 className="chart-card-title">{title}</h2>
      <p className="chart-card-description">{description}</p>
    </div>
    <strong className="chart-card-value">{value}</strong>
  </header>
);

export default React.memo(ChartCardHeader);
