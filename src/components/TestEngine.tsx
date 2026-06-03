import { useEffect, useRef, useState } from 'react';

import styles from './TestEngine.module.css';

type OptionKey = 'a' | 'b' | 'c' | 'd';

type SafeQuestion = {
  id: string;
  prompt: string;
  questionImageUrl: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  order: number;
};

type Props = {
  questions: SafeQuestion[];
  attemptId: string;
  durationSeconds: number;
  testTitle: string;
};

type DraftPayload = {
  answers: Record<string, OptionKey | null>;
  timings: Record<string, number | null>;
};

const optionKeys: OptionKey[] = ['a', 'b', 'c', 'd'];

function classNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ');
}

function getOptionLabels(question: SafeQuestion) {
  return {
    a: question.optionA,
    b: question.optionB,
    c: question.optionC,
    d: question.optionD,
  } satisfies Record<OptionKey, string>;
}

function formatTime(secondsLeft: number) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function TestEngine({ questions, attemptId, durationSeconds, testTitle }: Props) {
  const draftKey = `neet_draft_${attemptId}`;
  const timerRef = useRef<number | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const submitRef = useRef<(() => Promise<void>) | null>(null);
  const answersRef = useRef<Record<string, OptionKey | null>>({});
  const questionTimingsRef = useRef<Record<string, number | null>>({});
  const secondsLeftRef = useRef(durationSeconds);
  const isSubmittingRef = useRef(false);

  const [currentIndex, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionKey | null>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, null]))
  );
  const [questionTimings, setQuestionTimings] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, null]))
  );
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    questionTimingsRef.current = questionTimings;
  }, [questionTimings]);

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
      const draftPayload: DraftPayload = {
        answers: answersRef.current,
        timings: questionTimingsRef.current,
      };

      window.localStorage.setItem(draftKey, JSON.stringify(draftPayload));
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

    if (!savedDraft) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(savedDraft) as DraftPayload | Record<string, OptionKey | null>;

      if ('answers' in parsedDraft && parsedDraft.answers) {
        setAnswers((currentAnswers) => ({
          ...currentAnswers,
          ...parsedDraft.answers,
        }));
        setQuestionTimings((currentTimings) => ({
          ...currentTimings,
          ...(parsedDraft.timings ?? {}),
        }));
      } else {
        setAnswers((currentAnswers) => ({
          ...currentAnswers,
          ...parsedDraft,
        }));
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    startTimer();
    startAutosave();

    return () => {
      clearIntervals();
    };
  }, [draftKey]);

  function handleAnswer(option: OptionKey) {
    const question = questions[currentIndex];

    if (!question) {
      return;
    }

    const elapsedSeconds = Math.max(durationSeconds - secondsLeftRef.current, 0);

    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: option,
    }));

    setQuestionTimings((currentTimings) => ({
      ...currentTimings,
      [question.id]: currentTimings[question.id] ?? elapsedSeconds,
    }));
  }

  function clearAnswer(questionId: string) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: null,
    }));
  }

  async function handleSubmit() {
    if (isSubmittingRef.current || submitted) {
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
        answerTimings: questionTimingsRef.current,
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

    setSubmitted(true);
    window.localStorage.removeItem(draftKey);
    window.location.href = `/student/attempts/${attemptId}`;
  }

  submitRef.current = handleSubmit;

  const q = questions[currentIndex];
  const answeredCount = Object.values(answers).filter((value) => value !== null).length;
  const isWarning = secondsLeft <= 300;

  if (!q) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyCard}>No questions are available for this test yet.</p>
      </div>
    );
  }

  const optionLabels = getOptionLabels(q);

  return (
    <div className={styles.root}>
      {autoSubmitted && (
        <div className={styles.autoSubmitBanner}>
          ⏰ Time&apos;s up! Submitting your answers automatically...
        </div>
      )}

      <div className={classNames(styles.topbar, isWarning && styles.timerWarning)}>
        <div className={styles.topbarLeft}>
          <span className={styles.testTitle}>{testTitle}</span>
        </div>

        <div className={styles.timerWrapper}>
          <svg
            aria-hidden="true"
            className={styles.timerIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2.5" />
            <path d="M9 3h6" />
          </svg>
          <span className={styles.timerText}>{formatTime(secondsLeft)}</span>
        </div>

        <div className={styles.topbarRight}>
          <span className={styles.progressText}>
            {answeredCount} / {questions.length} answered
          </span>
          <button
            className={styles.submitBtnTop}
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
          >
            Submit Test
          </button>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.questionArea}>
          <div className={styles.questionInner}>
            {submitError && (
              <div className={styles.errorBanner}>
                <span className={styles.errorText}>{submitError}</span>
                <button className={styles.retryBtn} type="button" onClick={() => void handleSubmit()}>
                  Retry
                </button>
              </div>
            )}

            <div className={styles.questionMeta}>
              <span className={styles.questionNumber}>Question {currentIndex + 1}</span>
            </div>

            <div className={styles.questionCard}>
              {q.questionImageUrl && (
                <div className={styles.questionImageWrap}>
                  <img className={styles.questionImage} src={q.questionImageUrl} alt={`Question ${currentIndex + 1}`} />
                </div>
              )}
              <p className={styles.questionText}>{q.prompt}</p>
            </div>

            <div className={styles.optionsGrid}>
              {optionKeys.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={classNames(styles.optionBtn, answers[q.id] === opt && styles.selected)}
                  onClick={() => handleAnswer(opt)}
                  disabled={isSubmitting}
                >
                  <div className={styles.optionLetter}>{opt.toUpperCase()}</div>
                  <span className={styles.optionText}>{optionLabels[opt]}</span>
                </button>
              ))}
            </div>

            <div className={styles.navRow}>
              <button
                className={styles.navBtn}
                type="button"
                onClick={() => setCurrent((index) => Math.max(index - 1, 0))}
                disabled={isSubmitting || currentIndex === 0}
              >
                ← Previous
              </button>

              {answers[q.id] && (
                <button className={styles.clearBtn} type="button" onClick={() => clearAnswer(q.id)}>
                  Clear selection
                </button>
              )}

              <button
                className={styles.navBtn}
                type="button"
                onClick={() => setCurrent((index) => Math.min(index + 1, questions.length - 1))}
                disabled={isSubmitting || currentIndex === questions.length - 1}
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        <div className={styles.paletteShell}>
          <div className={styles.palette}>
            <div className={styles.paletteHeader}>
              <div className={styles.paletteTitle}>Question Palette</div>
              <div className={styles.paletteLegend}>
                <div className={styles.legendItem}>
                  <div className={classNames(styles.legendDot, styles.answered)} />
                  Answered
                </div>
                <div className={styles.legendItem}>
                  <div className={classNames(styles.legendDot, styles.current)} />
                  Current
                </div>
                <div className={styles.legendItem}>
                  <div className={classNames(styles.legendDot, styles.skipped)} />
                  Skipped
                </div>
              </div>
            </div>

            <div className={styles.paletteGrid}>
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className={classNames(
                    styles.paletteBtn,
                    index === currentIndex
                      ? styles.pCurrent
                      : answers[question.id]
                        ? styles.pAnswered
                        : styles.pSkipped
                  )}
                  onClick={() => setCurrent(index)}
                  disabled={isSubmitting}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <div className={styles.paletteFooter}>
              <p className={styles.paletteCount}>
                <strong>{answeredCount}</strong> of {questions.length} answered
              </p>
              <button
                className={styles.submitBtnPalette}
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                Submit Test →
              </button>
            </div>
          </div>
        </div>
      </div>

      {isSubmitting && (
        <div className={styles.overlay}>
          <div className={styles.overlayCard}>
            <div className={styles.spinner} />
            <p className={styles.overlayTitle}>Submitting your test...</p>
            <p className={styles.overlaySubtext}>Please do not close this page</p>
          </div>
        </div>
      )}
    </div>
  );
}
