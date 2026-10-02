import { FormControl, MenuItem, Select as MuiSelect } from '@mui/material';
import Icon from './Icon.jsx';
import { t } from './i18n/index.js';

export default function Select({
  id,
  label,
  describedBy,
  value = '',
  options,
  onChange,
  disabled = false,
  required = false,
  placeholder = t('common.none'),
  icon,
  variant = '',
  renderOption,
}) {
  const current = options.find((option) => option.id === (value ?? ''));

  return (
    <FormControl
      className={`select-control ${variant}`.trim()}
      size="small"
      fullWidth
      disabled={disabled || !options.length}
      required={required}
    >
      <MuiSelect
        id={id}
        aria-label={label}
        aria-describedby={describedBy}
        value={value ?? ''}
        displayEmpty
        onChange={(event) => onChange(event.target.value)}
        renderValue={() => (
          <span className="mui-select-display">
            {icon ? (
              <span className="select-leading-icon">
                <Icon name={icon} size={17} />
              </span>
            ) : null}
            <span className={`select-value ${current ? '' : 'placeholder'}`.trim()}>
              {current ? renderOption?.(current) ?? current.label : placeholder}
            </span>
          </span>
        )}
        MenuProps={{
          PaperProps: {
            className: `mui-select-menu ${variant}`.trim(),
          },
          MenuListProps: {
            dense: true,
          },
        }}
        sx={{
          minHeight: 42,
          borderRadius: '10px',
          '& .MuiSelect-select': {
            display: 'flex',
            alignItems: 'center',
            minHeight: '0 !important',
            py: 1,
          },
        }}
      >
        {options.map((option) => (
          <MenuItem
            key={option.id}
            value={option.id}
            disabled={option.disabled}
            selected={option.id === value}
          >
            <span className="select-value">
              {renderOption?.(option) ?? option.label}
            </span>
            {option.id === value ? (
              <span className="mui-select-check">
                <Icon name="check" size={16} />
              </span>
            ) : null}
          </MenuItem>
        ))}
      </MuiSelect>
    </FormControl>
  );
}
