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
          backgroundImage: 'none',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.48)',
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
            if (reason !== 'backdropClick') close(dialog?.type === 'confirm' ? false : null);
          }}
          fullWidth
          maxWidth="sm"
        >
          {dialog ? (
            <>
              <DialogTitle>{dialog.title}</DialogTitle>
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
                    minRows={dialog.multiline ? 3 : undefined}
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
                <Button onClick={() => close(dialog.type === 'confirm' ? false : null)}>
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
