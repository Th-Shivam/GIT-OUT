import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { NativeSpeechRecognizer } from './nativeSpeechRecognizer';
import type { SpeechRecognitionSession } from './types';

export function useSpeechRecognition() {
  const recognizer = useMemo(() => new NativeSpeechRecognizer(), []);
  const sessionRef = useRef<SpeechRecognitionSession | null>(null);
  const [state, setState] = useState<'idle' | 'checking' | 'listening'>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');

  const startRecognition = useCallback(
    async (language: string): Promise<string> => {
      setState('checking');
      setPartialTranscript('');
      try {
        const session = await recognizer.start(language, setPartialTranscript);
        sessionRef.current = session;
        setState('listening');
        return await session.promise;
      } finally {
        sessionRef.current = null;
        setState('idle');
        setPartialTranscript('');
      }
    },
    [recognizer],
  );

  const stopRecognition = useCallback(() => {
    sessionRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
    };
  }, []);

  return {
    isChecking: state === 'checking',
    isRecording: state === 'listening',
    partialTranscript,
    startRecognition,
    stopRecognition,
  };
}
