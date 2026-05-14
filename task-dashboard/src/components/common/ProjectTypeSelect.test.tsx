import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectTypeSelect } from './ProjectTypeSelect';
import { ProjectTypeDefinition } from '../../types';

const mockTypes: ProjectTypeDefinition[] = [
  {
    id: '1',
    code: 'DATA_COLLECTION',
    name: '数据采集',
    source: 'BUILTIN',
    enabled: true,
    referenceCount: 5,
  },
  {
    id: '2',
    code: 'DATA_PROCESSING',
    name: '数据处理',
    source: 'BUILTIN',
    enabled: true,
    referenceCount: 3,
  },
  {
    id: '3',
    code: 'DISABLED_TYPE',
    name: '已停用类型',
    source: 'CUSTOM',
    enabled: false,
    referenceCount: 0,
  },
];

describe('ProjectTypeSelect', () => {
  it('renders enabled types only', () => {
    render(
      <ProjectTypeSelect
        projectTypes={mockTypes}
        value=""
        onChange={() => {}}
      />,
    );
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('-- 请选择类型 --');
    expect(options[1]).toHaveTextContent('数据采集');
    expect(options[2]).toHaveTextContent('数据处理');
  });

  it('does not render disabled types', () => {
    render(
      <ProjectTypeSelect
        projectTypes={mockTypes}
        value=""
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('已停用类型')).not.toBeInTheDocument();
  });

  it('calls onChange with selected type code and definition', async () => {
    const user = userEvent.setup();
    let capturedCode = '';
    let capturedType: ProjectTypeDefinition | null = null;

    render(
      <ProjectTypeSelect
        projectTypes={mockTypes}
        value=""
        onChange={(code, type) => {
          capturedCode = code;
          capturedType = type;
        }}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'DATA_COLLECTION');
    expect(capturedCode).toBe('DATA_COLLECTION');
    expect(capturedType).not.toBeNull();
    expect(capturedType!.name).toBe('数据采集');
  });

  it('calls onChange with null type when placeholder selected', async () => {
    const user = userEvent.setup();
    let capturedType: ProjectTypeDefinition | null = {} as ProjectTypeDefinition;

    render(
      <ProjectTypeSelect
        projectTypes={mockTypes}
        value="DATA_COLLECTION"
        onChange={(_code, type) => {
          capturedType = type;
        }}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), '');
    expect(capturedType).toBeNull();
  });

  it('shows required attribute when required prop is true', () => {
    render(
      <ProjectTypeSelect
        projectTypes={mockTypes}
        value=""
        onChange={() => {}}
        required
      />,
    );
    expect(screen.getByRole('combobox')).toBeRequired();
  });

  it('disables select when disabled prop is true', () => {
    render(
      <ProjectTypeSelect
        projectTypes={mockTypes}
        value=""
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
