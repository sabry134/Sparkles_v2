import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  Button,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  ThemeProvider,
  StyledEngineProvider,
  createTheme,
} from '@mui/material';

const DialogContext = createContext(null);

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8b7cf6',
      light: '#a99df9',
      dark: '#6757df',
    },
    success: {
      main: '#63d4a0',
    },
    error: {
      main: '#ef6d78',
    },
    warning: {
      main: '#ddb46f',
    },
    background: {
      default: '#0f1117',
      paper: '#151922',
    },
    text: {
      primary: '#f4f5f7',
      secondary: '#a5aec0',
    },
    divider: '#292f3a',
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 650,
      letterSpacing: 0,
    },
    body1: {
      lineHeight: 1.5,
    },
    body2: {
      lineHeight: 1.45,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          maxWidth: '100%',
          overflowX: 'hidden',
        },
        body: {
          maxWidth: '100%',
          overflowX: 'hidden',
          scrollbarColor: '#3c4658 transparent',
          scrollbarWidth: 'thin',
        },
        '#root': {
          minHeight: '100dvh',
          maxWidth: '100%',
          overflowX: 'hidden',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        size: 'small',
      },
      styleOverrides: {
        root: {
          minHeight: 32,
          paddingInline: 11,
          borderRadius: 6,
          fontSize: '0.76rem',
          whiteSpace: 'nowrap',
        },
        containedPrimary: {
          backgroundColor: '#8b7cf6',
          '&:hover': {
            backgroundColor: '#9b8df8',
          },
        },
        outlined: {
          borderColor: '#353e4e',
          '&:hover': {
            borderColor: '#4a5568',
            backgroundColor: 'rgba(255,255,255,.025)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          color: '#909aaf',
          '&:hover': {
            color: '#f4f5f7',
            backgroundColor: 'rgba(255,255,255,.045)',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
        variant: 'outlined',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: '#11161f',
          fontSize: '0.8rem',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#465268',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#8b7cf6',
            borderWidth: 1,
          },
        },
        input: {
          paddingTop: 9,
          paddingBottom: 9,
        },
        notchedOutline: {
          borderColor: '#333d50',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#929caf',
          fontSize: '0.8rem',
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          marginLeft: 0,
          color: '#7f899c',
          fontSize: '0.7rem',
        },
      },
    },
    MuiSelect: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 36,
          borderRadius: 5,
          marginInline: 4,
          fontSize: '0.8rem',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 7,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          overflowX: 'hidden',
          border: '1px solid #30394a',
          borderRadius: 8,
          backgroundImage: 'none',
          backgroundColor: '#151922',
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.4)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: '18px 20px 8px',
          fontSize: '0.98rem',
          fontWeight: 720,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '12px 20px 18px',
          overflowX: 'hidden',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '10px 20px 18px',
          gap: 6,
        },
      },
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          color: '#a5aec0',
          fontSize: '0.8rem',
          lineHeight: 1.5,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        outlined: {
          borderColor: '#292f3a',
        },
      },
    },
    MuiAccordion: {
      defaultProps: {
        disableGutters: true,
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: '1px solid #292f3a',
          borderRadius: '6px !important',
          backgroundColor: '#151922',
          '&::before': {
            display: 'none',
          },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 40,
          paddingInline: 12,
          '&.Mui-expanded': {
            minHeight: 40,
          },
        },
        content: {
          margin: '8px 0',
          '&.Mui-expanded': {
            margin: '8px 0',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: '#8792a8',
          fontSize: '0.68rem',
          fontWeight: 700,
          letterSpacing: '0.025em',
          borderColor: '#292f3a',
        },
        body: {
          color: '#e9edf6',
          fontSize: '0.78rem',
          borderColor: '#242c39',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: 'rgba(139, 124, 246, 0.04)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 24,
          borderRadius: 5,
          fontWeight: 650,
          fontSize: '0.7rem',
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          padding: 7,
        },
        switchBase: {
          '&.Mui-checked': {
            color: '#63d4a0',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: '#63d4a0',
            opacity: 0.42,
          },
        },
        track: {
          backgroundColor: '#596377',
          opacity: 0.35,
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: false,
        enterDelay: 450,
      },
      styleOverrides: {
        tooltip: {
          padding: '6px 8px',
          border: '1px solid #333d50',
          borderRadius: 6,
          backgroundColor: '#1b202a',
          color: '#edf0f6',
          fontSize: '0.68rem',
          boxShadow: '0 8px 24px rgba(0,0,0,.28)',
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          maxWidth: 'calc(100vw - 24px)',
        },
      },
    },
  },
});

export function useUiDialog() {
  const value = useContext(DialogContext);
  if (!value) throw new Error('useUiDialog must be used inside SparklesMuiProvider');
  return value;
}

export default function SparklesMuiProvider({ children }) {
  const resolver = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState('');

  const close = useCallback((result) => {
    const resolve = resolver.current;
    resolver.current = null;
    setDialog(null);
    setValue('');
    resolve?.(result);
  }, []);

  const confirm = useCallback(
    ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setDialog({
          type: 'confirm',
          title,
          message,
          confirmLabel,
          cancelLabel,
        });
      }),
    [],
  );

  const prompt = useCallback(
    ({
      title,
      message = '',
      defaultValue = '',
      label = '',
      confirmLabel = 'Save',
      cancelLabel = 'Cancel',
      multiline = false,
      required = false,
    }) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setValue(defaultValue);
        setDialog({
          type: 'prompt',
          title,
          message,
          label,
          confirmLabel,
          cancelLabel,
          multiline,
          required,
        });
      }),
    [],
  );

  const contextValue = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <DialogContext.Provider value={contextValue}>
          {children}
          <Dialog
            open={Boolean(dialog)}
            onClose={() => close(dialog?.type === 'confirm' ? false : null)}
            fullWidth
            maxWidth="sm"
            aria-labelledby="sparkles-dialog-title"
          >
            {dialog ? (
              <>
                <DialogTitle id="sparkles-dialog-title">{dialog.title}</DialogTitle>
                <DialogContent>
                  {dialog.message ? (
                    <DialogContentText sx={{ mb: dialog.type === 'prompt' ? 1.5 : 0 }}>
                      {dialog.message}
                    </DialogContentText>
                  ) : null}
                  {dialog.type === 'prompt' ? (
                    <TextField
                      autoFocus
                      fullWidth
                      required={dialog.required}
                      label={dialog.label || dialog.title}
                      multiline={dialog.multiline}
                      minRows={dialog.multiline ? 4 : undefined}
                      maxRows={dialog.multiline ? 10 : undefined}
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter' &&
                          !dialog.multiline &&
                          (!dialog.required || value.trim())
                        ) {
                          event.preventDefault();
                          close(value);
                        }
                      }}
                    />
                  ) : null}
                </DialogContent>
                <DialogActions>
                  <Button
                    variant="text"
                    color="inherit"
                    onClick={() => close(dialog.type === 'confirm' ? false : null)}
                  >
                    {dialog.cancelLabel}
                  </Button>
                  <Button
                    variant="contained"
                    disabled={dialog.type === 'prompt' && dialog.required && !value.trim()}
                    onClick={() => close(dialog.type === 'confirm' ? true : value)}
                  >
                    {dialog.confirmLabel}
                  </Button>
                </DialogActions>
              </>
            ) : null}
          </Dialog>
        </DialogContext.Provider>
      </ThemeProvider>
    </StyledEngineProvider>
  );
}
