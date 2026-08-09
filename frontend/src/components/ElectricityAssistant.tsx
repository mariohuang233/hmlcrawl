import React, { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import bubuIcon from '../assets/bubu.png';
import { fetchAPI, formatErrorMessage } from '../utils/api';

const ReactECharts = lazy(() => import('echarts-for-react'));

interface AssistantSeries {
  name: string;
  values: number[];
}

interface AssistantAnswer {
  role: 'assistant';
  intent: string;
  headline: string;
  body: string;
  source: string;
  updatedAt?: string | null;
  mode: 'data' | 'ai' | 'prediction';
  metric?: { value: number; unit: string; label: string; comparison?: number };
  chart?: { kind: 'line' | 'bar'; labels: string[]; series: AssistantSeries[] };
  evidence?: Array<{ label: string; value: string }>;
  disclaimer?: string;
  quickReplies?: string[];
}

interface AssistantNotification {
  id: string;
  type: 'daily' | 'anomaly' | 'balance';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  actionLabel: string;
  prompt: string;
  source: string;
}

interface BriefingResponse {
  available: boolean;
  aiConfigured: boolean;
  notification: AssistantNotification;
  welcome: AssistantAnswer;
  quickReplies: string[];
}

interface ConversationItem {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  answer?: AssistantAnswer;
}

const DEFAULT_QUESTIONS = ['今天用了多少电？', '分析最近七天用电规律', '预计本月用多少？', '给我三个具体节电建议'];
const DISMISS_KEY = 'electricity-assistant-dismissed';
const SETTINGS_KEY = 'electricity-assistant-settings';

function readSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '') as { remindersEnabled: boolean };
  } catch {
    return { remindersEnabled: true };
  }
}

function AssistantChart({ answer }: { answer: AssistantAnswer }) {
  const option = useMemo(() => {
    if (!answer.chart) return null;
    const isBar = answer.chart.kind === 'bar';
    return {
      animationDuration: 320,
      backgroundColor: 'transparent',
      grid: { left: 8, right: 8, top: 22, bottom: 18, containLabel: true },
      tooltip: { trigger: 'axis', confine: true },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: '#92928c', fontSize: 10 },
        itemWidth: 10,
        itemHeight: 6
      },
      xAxis: {
        type: 'category',
        data: answer.chart.labels,
        axisLine: { lineStyle: { color: 'rgba(244,244,240,.1)' } },
        axisTick: { show: false },
        axisLabel: { color: '#777771', fontSize: 9, interval: answer.chart.labels.length > 12 ? 3 : 0 }
      },
      yAxis: {
        type: 'value',
        splitNumber: 3,
        axisLabel: { color: '#777771', fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(244,244,240,.07)' } }
      },
      series: answer.chart.series.map((series, index) => ({
        name: series.name,
        type: isBar ? 'bar' : 'line',
        data: series.values,
        smooth: !isBar,
        symbol: 'none',
        barMaxWidth: 18,
        itemStyle: { color: index === 0 ? '#ff385c' : '#686864', borderRadius: isBar ? [4, 4, 0, 0] : 0 },
        lineStyle: { width: index === 0 ? 2 : 1.5, type: index === 0 ? 'solid' : 'dashed' },
        areaStyle: !isBar && index === 0 ? { color: 'rgba(255,56,92,.08)' } : undefined
      }))
    };
  }, [answer]);

  if (!option) return null;
  return (
    <Suspense fallback={<div className="assistant-chart-placeholder">趋势图加载中…</div>}>
      <ReactECharts option={option} className="assistant-chart" opts={{ renderer: 'canvas' }} />
    </Suspense>
  );
}

function AssistantBody({ text }: { text: string }) {
  const cleaned = text.replace(/\*\*/g, '').trim();
  const blocks = cleaned
    .split(/\n{2,}|(?=(?:结论|数据证据|数据依据|依据|观察|分析|原因|可解释范围|建议|说明)[：:])/)
    .map(block => block.trim())
    .filter(Boolean);

  return (
    <div className="assistant-body">
      {blocks.map((block, index) => {
        const section = block.match(/^(结论|数据证据|数据依据|依据|观察|分析|原因|可解释范围|建议|说明)[：:]\s*([\s\S]*)$/);
        if (section) {
          return (
            <section className="assistant-body-section" key={`${section[1]}-${index}`}>
              <strong>{section[1]}</strong>
              <p>{section[2]}</p>
            </section>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

function AnswerCard({ answer, onQuestion }: { answer: AssistantAnswer; onQuestion: (question: string) => void }) {
  const modeLabel = answer.mode === 'ai' ? 'AI 分析' : answer.mode === 'prediction' ? '趋势预测' : '实时电表数据';
  return (
    <div className="assistant-answer">
      <div className="assistant-answer-card">
        <div className={`assistant-answer-mode is-${answer.mode}`}>{modeLabel}</div>
        <div className="assistant-answer-heading">{answer.headline}</div>
        <AssistantBody text={answer.body} />
        {answer.metric && (
          <div className="assistant-metric">
            <span>{answer.metric.label}</span>
            <strong>{answer.metric.value}<small>{answer.metric.unit}</small></strong>
          </div>
        )}
        <AssistantChart answer={answer} />
        {answer.evidence && (
          <div className="assistant-evidence">
            {answer.evidence.map(item => (
              <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
            ))}
          </div>
        )}
        <div className="assistant-source">{answer.source}</div>
        {answer.disclaimer && <div className="assistant-disclaimer">{answer.disclaimer}</div>}
      </div>
      {!!answer.quickReplies?.length && (
        <div className="assistant-quick-replies">
          {answer.quickReplies.slice(0, 3).map(question => (
            <button key={question} type="button" onClick={() => onQuestion(question)}>{question}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ElectricityAssistant() {
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reminderVisible, setReminderVisible] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(() => readSettings().remindersEnabled);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchAPI<BriefingResponse>('/api/assistant/briefing', {}, 60_000)
      .then(data => {
        if (!active) return;
        setBriefing(data);
        const dismissed = Number(window.localStorage.getItem(`${DISMISS_KEY}:${data.notification.id}`) || 0);
        setReminderVisible(remindersEnabled && dismissed < Date.now());
      })
      .catch(() => {
        if (active) setReminderVisible(false);
      });
    return () => { active = false; };
  }, [remindersEnabled]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container && typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [conversation, isSending]);

  useEffect(() => {
    if (isOpen) window.setTimeout(() => inputRef.current?.focus(), 180);
  }, [isOpen]);

  const dismissReminder = (delayMs: number) => {
    if (briefing?.notification) {
      window.localStorage.setItem(`${DISMISS_KEY}:${briefing.notification.id}`, String(Date.now() + delayMs));
    }
    setReminderVisible(false);
  };

  const openWithQuestion = (question?: string) => {
    setIsOpen(true);
    setShowSettings(false);
    if (question) void sendQuestion(question);
  };

  const sendQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isSending) return;
    setError(null);
    setInput('');
    setIsOpen(true);
    setConversation(items => [...items, { id: `u-${Date.now()}`, role: 'user', text: question }]);
    setIsSending(true);
    try {
      const answer = await fetchAPI<AssistantAnswer>('/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: question })
      }, 60_000);
      setConversation(items => [...items, { id: `a-${Date.now()}`, role: 'assistant', answer }]);
    } catch (requestError) {
      setError(formatErrorMessage(requestError));
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendQuestion(input);
  };

  const saveReminderSetting = (enabled: boolean) => {
    setRemindersEnabled(enabled);
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ remindersEnabled: enabled }));
    if (!enabled) setReminderVisible(false);
  };

  const initialQuestions = briefing?.quickReplies || DEFAULT_QUESTIONS;

  return (
    <div className={`electricity-assistant ${isOpen ? 'is-open' : ''}`}>
      {reminderVisible && briefing?.notification && (
        <aside className={`assistant-reminder is-${briefing.notification.severity}`} aria-live="polite">
          <button className="assistant-reminder-close" type="button" onClick={() => dismissReminder(24 * 60 * 60 * 1000)} aria-label="关闭本次提醒">关闭</button>
          <strong>{briefing.notification.title}</strong>
          <p>{briefing.notification.message}</p>
          <div>
            <button className="assistant-text-action is-primary" type="button" onClick={() => openWithQuestion(briefing.notification.prompt)}>{briefing.notification.actionLabel}</button>
            <button className="assistant-text-action" type="button" onClick={() => dismissReminder(4 * 60 * 60 * 1000)}>稍后提醒</button>
          </div>
        </aside>
      )}

      {isOpen && (
        <aside className="assistant-panel" aria-label="布布用电助手">
          <div className="assistant-drag-handle" aria-hidden="true" />
          <header className="assistant-panel-header">
            <div className="assistant-identity">
              <img src={bubuIcon} alt="" />
              <div><strong>布布用电助手</strong><span>{briefing?.aiConfigured ? 'AI 已连接' : '数据查询模式'}</span></div>
            </div>
            <div className="assistant-panel-actions">
              <button type="button" onClick={() => setShowSettings(value => !value)} aria-expanded={showSettings}>提醒设置</button>
              <button type="button" onClick={() => setIsOpen(false)}>关闭</button>
            </div>
          </header>

          {showSettings ? (
            <div className="assistant-settings">
              <h3>提醒设置</h3>
              <label>
                <span><strong>主动用电提醒</strong><small>日报、异常增长和低余额提醒</small></span>
                <input type="checkbox" checked={remindersEnabled} onChange={event => saveReminderSetting(event.target.checked)} />
              </label>
              <div className="assistant-settings-note">默认免打扰时间为 22:00–08:00；同一提醒关闭后当天不会重复出现。</div>
              <button type="button" className="assistant-primary-button" onClick={() => setShowSettings(false)}>完成</button>
            </div>
          ) : (
            <>
              <div className="assistant-conversation" ref={scrollRef}>
                {conversation.length === 0 && (
                  <div className="assistant-welcome">
                    <img src={bubuIcon} alt="" />
                    <strong>想了解哪段用电？</strong>
                    <span>简单问题直接查询电表，复杂问题由 AI 基于真实数据分析。</span>
                    <div className="assistant-mode-entry">
                      <button type="button" onClick={() => void sendQuestion('今天用了多少电？')}><strong>查用电数据</strong><span>余额、用量、费用与峰值</span></button>
                      <button type="button" onClick={() => void sendQuestion('分析最近七天的用电规律')}><strong>让 AI 分析</strong><span>原因、规律、比较与建议</span></button>
                    </div>
                    <div className="assistant-starter-grid">
                      {initialQuestions.map(question => <button key={question} type="button" onClick={() => void sendQuestion(question)}>{question}</button>)}
                    </div>
                  </div>
                )}
                {conversation.map(item => item.role === 'user' ? (
                  <div key={item.id} className="assistant-user-message">{item.text}</div>
                ) : item.answer ? (
                  <div key={item.id} className="assistant-response-row">
                    <img src={bubuIcon} alt="" />
                    <AnswerCard answer={item.answer} onQuestion={question => void sendQuestion(question)} />
                  </div>
                ) : null)}
                {isSending && <div className="assistant-loading">布布正在读取最新用电数据…</div>}
                {error && <div className="assistant-error">{error}<button type="button" onClick={() => setError(null)}>知道了</button></div>}
              </div>
              <form className="assistant-input" onSubmit={handleSubmit}>
                <input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} placeholder="继续问用电问题…" maxLength={500} aria-label="输入用电问题" />
                <button type="submit" disabled={!input.trim() || isSending}>发送</button>
              </form>
            </>
          )}
        </aside>
      )}

      <button className="assistant-launcher" type="button" onClick={() => setIsOpen(value => !value)} aria-label={isOpen ? '收起布布用电助手' : '打开布布用电助手'} aria-expanded={isOpen}>
        <img src={bubuIcon} alt="" />
        {reminderVisible && <span className="assistant-unread" />}
      </button>
    </div>
  );
}
