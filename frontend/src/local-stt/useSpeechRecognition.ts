import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { NativeSpeechRecognizer } from './nativeSpeechRecognizer';
import type { SpeechRecognitionSession } from './types';

export function useSpeechRecognition() {
  const recognizer = useMemo(() => new NativeSpeechRecognizer(), []);
  const sessionRef = useRef<SpeechRecognitionSession | null>(null);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  const [state, setState] = useState<'idle' | 'checking' | 'listening' | 'transcribing'>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');

  const startRecognition = useCallback(
    async (language: string): Promise<string> => {
      const request = ++requestRef.current;
      const isCancelled = () => !mountedRef.current || request !== requestRef.current || AppState.currentState !== 'active';
      setState('checking');
      setPartialTranscript('');
      try {
        const session = await recognizer.start(language, (text) => {
          if (!isCancelled()) setPartialTranscript(text);
        }, isCancelled);
        sessionRef.current = session;
        if (isCancelled()) session.cancel();
        else setState('listening');
        return await session.promise;
      } finally {
        if (request === requestRef.current) sessionRef.current = null;
        if (mountedRef.current && request === requestRef.current) {
          setState('idle');
          setPartialTranscript('');
        }
      }
    },
    [recognizer],
  );

  const stopRecognition = useCallback(() => {
    setState('transcribing');
    sessionRef.current?.stop();
  }, []);

  const cancelRecognition = useCallback(() => {
    ++requestRef.current;
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setState('idle');
    setPartialTranscript('');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const cancel = () => {
      ++requestRef.current;
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      cancel();
      setState('idle');
      setPartialTranscript('');
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      cancel();
    };
  }, []);

  return {
    isChecking: state === 'checking',
    isRecording: state === 'listening',
    isTranscribing: state === 'transcribing',
    partialTranscript,
    startRecognition,
    stopRecognition,
    cancelRecognition,
  };
}
