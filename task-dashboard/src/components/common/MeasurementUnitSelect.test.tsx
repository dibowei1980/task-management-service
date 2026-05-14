import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeasurementUnitSelect } from './MeasurementUnitSelect';
import { MeasurementUnitDefinition } from '../../types';

const mockUnits: MeasurementUnitDefinition[] = [
  { id: '1', code: 'GE', name: '个', builtin: true, enabled: true, basic: false, baseUnitCode: 'COUNT', baseUnitName: '计数', conversionFactor: 1 },
  { id: '2', code: 'SQ_KM', name: '平方公里', builtin: true, enabled: true, basic: false, baseUnitCode: 'SQ_M', baseUnitName: '平方米', conversionFactor: 1000000 },
  { id: '3', code: 'DISABLED', name: '已停用单位', builtin: false, enabled: false, basic: false, baseUnitCode: 'COUNT', baseUnitName: '计数', conversionFactor: 1 },
];

describe('MeasurementUnitSelect', () => {
  it('renders enabled units only', () => {
    render(
      <MeasurementUnitSelect
        measurementUnits={mockUnits}
        value=""
        onChange={() => {}}
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('-- 请选择单位 --');
    expect(options[1]).toHaveTextContent('个 (GE)');
    expect(options[2]).toHaveTextContent('平方公里 (SQ_KM)');
  });

  it('does not render disabled units', () => {
    render(
      <MeasurementUnitSelect
        measurementUnits={mockUnits}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('已停用单位')).not.toBeInTheDocument();
  });

  it('calls onChange with selected unit code', async () => {
    const user = userEvent.setup();
    let capturedCode = '';

    render(
      <MeasurementUnitSelect
        measurementUnits={mockUnits}
        value=""
        onChange={(code) => {
          capturedCode = code;
        }}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'GE');
    expect(capturedCode).toBe('GE');
  });

  it('renders read-only input when readOnly is true', () => {
    render(
      <MeasurementUnitSelect
        measurementUnits={mockUnits}
        value="GE"
        onChange={() => {}}
        readOnly
      />,
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveValue('个');
  });

  it('renders read-only with readOnlyLabel fallback', () => {
    render(
      <MeasurementUnitSelect
        measurementUnits={[]}
        value="UNKNOWN"
        onChange={() => {}}
        readOnly
        readOnlyLabel="自定义单位"
      />,
    );
    expect(screen.getByRole('textbox')).toHaveValue('自定义单位');
  });

  it('disables select when disabled prop is true', () => {
    render(
      <MeasurementUnitSelect
        measurementUnits={mockUnits}
        value=""
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
