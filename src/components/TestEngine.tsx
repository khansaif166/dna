import { useEffect, useRef, useState } from 'react';

type OptionKey = 'a' | 'b' | 'c' | 'd';

type Question = {
  id: string;
  prompt: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  order: number;
};

type Props = {
  questions: Question[];
  attemptId: string;
  durationSeconds: number;
  testTitle?: string;
};

export default function TestEngine({ questions, attemptId, durationSeconds, testTitle }: Props) {
  const draftKey = `neet_draft_${attemptId}`;
  const timerRef = useRef<number | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const submitRef = useRef<(() => Promise<void>) | null>(null);
  const answersRef = useRef<Record<string, OptionKey | null>>({});
  const secondsLeftRef = useRef(durationSeconds);
  const isSubmittingRef = useRef(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | null>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, null]))
  );
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  function clearIntervals() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (autosaveRef.current !== null) {
      window.clearInterval(autosaveRef.current);
      autosaveRef.current = null;
    }
  }

  function startAutosave() {
    if (autosaveRef.current !== null) {
      return;
    }

    autosaveRef.current = window.setInterval(() => {
      window.localStorage.setItem(draftKey, JSON.stringify(answersRef.current));
    }, 30000);
  }

  function startTimer() {
    if (timerRef.current !== null) {
      return;
    }

    timerRef.current = window.setInterval(() => {
      if (isSubmittingRef.current) {
        return;
      }

      setSecondsLeft((currentSeconds) => {
        if (currentSeconds <= 1) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }

          setAutoSubmitted(true);

          window.setTimeout(() => {
            void submitRef.current?.();
          }, 0);

          return 0;
        }

        return currentSeconds - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(draftKey);

    if (savedDraft) {
      try {
        const parsedDraft = JSON.parse(savedDraft) as Record<string, OptionKey | null>;
        setAnswers((currentAnswers) => ({
          ...currentAnswers,
          ...parsedDraft,
        }));
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }
  }, [draftKey]);

  async function handleSubmit() {
    if (isSubmittingRef.current) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    isSubmittingRef.current = true;
    clearIntervals();

    const timeTakenSeconds = Math.max(durationSeconds - secondsLeftRef.current, 0);

    const response = await fetch('/api/attempts/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attemptId,
        answers: answersRef.current,
        timeTakenSeconds,
      }),
    }).catch(() => null);

    if (!response?.ok) {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      setSubmitError('Submission failed. Check your connection and try again.');

      if (secondsLeftRef.current > 0) {
        startTimer();
      }

      startAutosave();
      return;
    }

    window.localStorage.removeItem(draftKey);
    window.location.href = `/student/attempts/${attemptId}`;
  }

  submitRef.current = handleSubmit;

  useEffect(() => {
    startTimer();
    startAutosave();

    return () => {
      clearIntervals();
    };
  }, [draftKey]);

  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.values(answers).filter((value) => value !== null).length;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  if (!currentQuestion) {
    return (
      <section className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4">
        <p className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 text-gray-300">
          No questions are available for this test yet.
        </p>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-gray-950 text-white flex flex-col relative">
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 text-center">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-5 shadow-xl">
            <p className="text-lg font-semibold text-white">Submitting... do not close this page</p>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex justify-between items-center sticky top-0 z-10">
        <div>
          <p className="text-white font-semibold">{testTitle ?? 'Test'}</p>
          <p className="text-sm text-gray-400">
            Answered {answeredCount} of {questions.length}
          </p>
        </div>
        <strong
          className={
            secondsLeft < 300
              ? 'text-red-400 font-mono text-lg font-bold animate-pulse'
              : 'text-white font-mono text-lg font-bold'
          }
        >
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </strong>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
        {autoSubmitted && (
          <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Time is up! Submitting your answers...
          </div>
        )}

        <h2 className="text-sm uppercase tracking-[0.18em] text-gray-400">Question {currentQuestion.order}</h2>
        <p className="text-white text-lg mb-6 leading-relaxed mt-3">{currentQuestion.prompt}</p>

        <div>
          {([
            ['a', currentQuestion.optionA],
            ['b', currentQuestion.optionB],
            ['c', currentQuestion.optionC],
            ['d', currentQuestion.optionD],
          ] as const).map(([optionKey, optionValue]) => (
            <button
              key={optionKey}
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setAnswers((currentAnswers) => ({
                  ...currentAnswers,
                  [currentQuestion.id]: optionKey,
                }));
              }}
              className={
                answers[currentQuestion.id] === optionKey
                  ? 'w-full text-left bg-blue-600/20 border border-blue-500 rounded-xl px-4 py-3 text-white mb-3 disabled:cursor-not-allowed disabled:opacity-60'
                  : 'w-full text-left bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-gray-300 hover:border-blue-500 hover:text-white transition-colors mb-3 disabled:cursor-not-allowed disabled:opacity-60'
              }
            >
              {optionValue}
            </button>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <button
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isSubmitting || currentIndex === 0}
            onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
          >
            Previous
          </button>
          <button
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isSubmitting || currentIndex === questions.length - 1}
            onClick={() => setCurrentIndex((index) => Math.min(index + 1, questions.length - 1))}
          >
            Next
          </button>
        </div>

        <div className="grid grid-cols-8 sm:grid-cols-10 gap-2 mt-6">
          {questions.map((question, index) => (
            <button
              key={question.id}
              className={
                answers[question.id]
                  ? 'bg-green-600 text-white text-xs rounded-lg w-8 h-8 disabled:cursor-not-allowed disabled:opacity-60'
                  : 'bg-gray-800 text-gray-400 text-xs rounded-lg w-8 h-8 disabled:cursor-not-allowed disabled:opacity-60'
              }
              type="button"
              disabled={isSubmitting}
              onClick={() => setCurrentIndex(index)}
            >
              {question.order}
            </button>
          ))}
        </div>

        <div className="mt-8">
          {submitError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">
              {submitError}
            </div>
          )}

          {submitError && (
            <button
              className="mb-4 rounded-lg border border-red-400 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10"
              type="button"
              onClick={() => void handleSubmit()}
            >
              Retry
            </button>
          )}

          <div>
            <button
              className="bg-green-600 hover:bg-green-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
