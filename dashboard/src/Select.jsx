import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listId = `${controlId}-options`;
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menuStyle, setMenuStyle] = useState({});
  const selected = options.findIndex((option) => option.id === (value ?? ''));
  const current = options[selected];

  function close() {
    setOpen(false);
  }

  function choose(index) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.id);
    close();
    trigger.current?.focus({ preventScroll: true });
  }

  function move(direction) {
    let index = active;
    for (let step = 0; step < options.length; step += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) {
        setActive(index);
        return;
      }
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        setActive(Math.max(selected, 0));
        setOpen(true);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        move(event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Home' || event.key === 'End') {
        setActive(event.key === 'Home' ? 0 : options.length - 1);
      } else {
        choose(active);
      }
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const key = event.key.toLocaleLowerCase();
      const candidates = options.map((_, index) => (active + index + 1) % options.length);
      const match = candidates.find(
        (index) =>
          !options[index].disabled &&
          options[index].label.toLocaleLowerCase().startsWith(key),
      );
      if (match !== undefined) {
        event.preventDefault();
        setOpen(true);
        setActive(match);
      }
    }
  }

  useEffect(() => {
    if (disabled) close();
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (!root.current?.contains(event.target) && !list.current?.contains(event.target)) {
        close();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!trigger.current) return;
      const anchor =
        variant === 'guild-select' ? root.current?.parentElement ?? trigger.current : trigger.current;
      const bounds = anchor.getBoundingClientRect();
      const viewportGap = 12;
      const menuGap = 7;
      const below = window.innerHeight - bounds.bottom - viewportGap;
      const above = bounds.top - viewportGap;
      const desired = Math.min(list.current?.scrollHeight ?? 320, 320);
      const placeAbove = below < Math.min(desired, 180) && above > below;
      const maxHeight = Math.max(96, Math.min(320, placeAbove ? above - menuGap : below - menuGap));
      const visibleHeight = Math.min(desired, maxHeight);
      setMenuStyle({
        left: Math.max(viewportGap, Math.min(bounds.left, window.innerWidth - bounds.width - viewportGap)),
        top: placeAbove
          ? Math.max(viewportGap, bounds.top - visibleHeight - menuGap)
          : bounds.bottom + menuGap,
        width: Math.min(bounds.width, window.innerWidth - viewportGap * 2),
        maxHeight,
      });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, options.length, variant]);

  useLayoutEffect(() => {
    if (!open || !list.current) return;
    const option = list.current.children[active];
    if (!option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.current.scrollTop) list.current.scrollTop = top;
    if (bottom > list.current.scrollTop + list.current.clientHeight) {
      list.current.scrollTop = bottom - list.current.clientHeight;
    }
  }, [open, active]);

  const menu = open
    ? createPortal(
        <ul
          className={`select-menu ${variant}`.trim()}
          ref={list}
          id={listId}
          role="listbox"
          aria-label={label}
          style={menuStyle}
        >
          {options.map((option, index) => (
            <li
              id={`${listId}-${index}`}
              key={option.id}
              role="option"
              aria-selected={index === selected}
              aria-disabled={option.disabled || undefined}
              data-active={index === active}
              data-selected={index === selected}
              onPointerMove={() => !option.disabled && setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span className="select-value">{renderOption?.(option) ?? option.label}</span>
              {index === selected ? <Icon name="check" size={16} /> : null}
            </li>
          ))}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div className={`select-control ${variant}`.trim()} ref={root} data-open={open}>
      <button
        id={controlId}
        ref={trigger}
        className="select-trigger"
        type="button"
        role="combobox"
        aria-label={label}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-required={required || undefined}
        disabled={disabled || !options.length}
        onKeyDown={onKeyDown}
        onClick={() => {
          setActive(Math.max(selected, 0));
          setOpen(!open);
        }}
      >
        {icon ? (
          <span className="select-leading-icon">
            <Icon name={icon} size={17} />
          </span>
        ) : null}
        <span className={`select-value ${current ? '' : 'placeholder'}`.trim()}>
          {current ? renderOption?.(current) ?? current.label : placeholder}
        </span>
        <span className="select-chevron">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {menu}
      {required ? (
        <select
          className="select-native"
          tabIndex={-1}
          aria-hidden="true"
          required
          disabled={disabled}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          onInvalid={(event) => {
            event.preventDefault();
            setOpen(true);
            trigger.current?.focus();
          }}
        >
          <option value="" />
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
