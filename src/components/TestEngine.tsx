import { useEffect, useRef, useState } from 'react';

import styles from './TestEngine.module.css';

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

const optionKeys = ['a', 'b', 'c', 'd'] as const;

function classNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ');
}

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
  const timerValue = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimerWarning = secondsLeft <= 300;

  if (!currentQuestion) {
    return (
      <section className={styles.emptyState}>
        <p className={styles.emptyCard}>No questions are available for this test yet.</p>
      </section>
    );
  }

  return (
    <section className={styles.engine}>
      {isSubmitting && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <div className={styles.spinner} aria-hidden="true"></div>
            <p className={styles.overlayTitle}>Submitting your answers...</p>
            <p className={styles.overlayText}>Please do not close this page</p>
          </div>
        </div>
      )}

      <header className={styles.topBar}>
        <p className={styles.title}>{testTitle ?? 'Test'}</p>
        <div className={classNames(styles.timer, isTimerWarning && styles.timerWarning)}>{timerValue}</div>
        <div className={styles.topBarRight}>
          <span className={styles.progressText}>
            {answeredCount} / {questions.length} answered
          </span>
          <button
            className={styles.submitTopButton}
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
          >
            Submit
          </button>
        </div>
      </header>

      <div className={styles.contentArea}>
        <main className={styles.mainPane}>
          <div className={styles.mainPaneInner}>
            {autoSubmitted && <div className={styles.autoSubmitNote}>Time is up! Submitting your answers...</div>}
            {submitError && <div className={styles.errorNote}>{submitError}</div>}
            {submitError && (
              <button className={styles.retryButton} type="button" onClick={() => void handleSubmit()}>
                Retry submission
              </button>
            )}

            <p className={styles.questionLabel}>Question {currentQuestion.order}</p>
            <p className={styles.questionPrompt}>{currentQuestion.prompt}</p>

            <div className={styles.optionsList}>
              {optionKeys.map((optionKey) => {
                const optionValue =
                  optionKey === 'a'
                    ? currentQuestion.optionA
                    : optionKey === 'b'
                      ? currentQuestion.optionB
                      : optionKey === 'c'
                        ? currentQuestion.optionC
                        : currentQuestion.optionD;
                const isSelected = answers[currentQuestion.id] === optionKey;

                return (
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
                    className={classNames(styles.optionButton, isSelected && styles.optionSelected)}
                  >
                    <span className={styles.optionBubble}>{optionKey.toUpperCase()}</span>
                    <span className={styles.optionText}>{optionValue}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.navigationRow}>
              <button
                className={classNames(styles.navButton, styles.navButtonSecondary)}
                type="button"
                disabled={isSubmitting || currentIndex === 0}
                onClick={() => setCurrentIndex((index) => Math.max(index - 1, 0))}
              >
                ← Previous
              </button>
              <button
                className={styles.navButton}
                type="button"
                disabled={isSubmitting || currentIndex === questions.length - 1}
                onClick={() => setCurrentIndex((index) => Math.min(index + 1, questions.length - 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </main>

        <aside className={styles.sidePane}>
          <h2 className={styles.paletteTitle}>Question Palette</h2>

          <div className={styles.legendRow}>
            <div className={styles.legendItem}>
              <span className={classNames(styles.legendDot, styles.legendDotAnswered)}></span>
              <span>Answered</span>
            </div>
            <div className={styles.legendItem}>
              <span className={classNames(styles.legendDot, styles.legendDotSkipped)}></span>
              <span>Not visited</span>
            </div>
          </div>

          <div className={styles.paletteGrid}>
            {questions.map((question, index) => {
              const isCurrent = index === currentIndex;
              const isAnswered = answers[question.id] !== null;

              return (
                <button
                  key={question.id}
                  className={classNames(
                    styles.paletteButton,
                    isAnswered && styles.paletteButtonAnswered,
                    isCurrent && styles.paletteButtonCurrent
                  )}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setCurrentIndex(index)}
                >
                  {question.order}
                </button>
              );
            })}
          </div>

          <div className={styles.paletteSubmit}>
            <p className={styles.paletteSubmitText}>
              {answeredCount} of {questions.length} answered
            </p>
            <button
              className={styles.submitPaletteButton}
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleSubmit()}
            >
              Submit Test
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
