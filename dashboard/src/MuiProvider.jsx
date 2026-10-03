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
      default: '#0d1017',
      paper: '#151a23',
    },
    text: {
      primary: '#f5f7fb',
      secondary: '#aeb7ca',
    },
    divider: '#2a3241',
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 650,
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 9,
          minHeight: 36,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#11161f',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#465268',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#8b7cf6',
          },
        },
        notchedOutline: {
          borderColor: '#333d50',
        },
      },
    },
    MuiSelect: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: '1px solid #30394a',
          borderRadius: 14,
          backgroundImage: 'none',
          backgroundColor: '#151a23',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.48)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: '22px 24px 10px',
          fontSize: '1.02rem',
          fontWeight: 750,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '14px 24px 20px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '12px 24px 20px',
          gap: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        outlined: {
          borderColor: '#2a3241',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: '#8792a8',
          fontSize: '0.72rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.035em',
          borderColor: '#2a3241',
        },
        body: {
          color: '#e9edf6',
          fontSize: '0.8rem',
          borderColor: '#242c39',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: 'rgba(139, 124, 246, 0.045)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          fontWeight: 650,
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
          },
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
          onClose={(_, reason) => {
            if (reason !== 'backdropClick') {
              close(dialog?.type === 'confirm' ? false : null);
            }
          }}
          fullWidth
          maxWidth="sm"
          aria-labelledby="sparkles-dialog-title"
        >
          {dialog ? (
            <>
              <DialogTitle id="sparkles-dialog-title">{dialog.title}</DialogTitle>
              <DialogContent>
                {dialog.message ? (
                  <DialogContentText sx={{ mb: dialog.type === 'prompt' ? 2 : 0 }}>
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
                  onClick={() =>
                    close(dialog.type === 'confirm' ? true : value)
                  }
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
