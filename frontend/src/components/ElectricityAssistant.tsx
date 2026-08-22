import React, { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import bubuIcon from '../assets/bubu.png';
import { fetchAPI, formatErrorMessage, streamAPI } from '../utils/api';
import type { AssistantAnswer, AssistantBriefing, AssistantNotification } from '../types/dashboard';

const Chart = lazy(() => import('./Chart'));

interface ConversationItem {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  answer?: AssistantAnswer;
}

const DEFAULT_QUESTIONS = ['查看空调和热水器用电', '分析最近七天用电规律', '预计本月用多少？', '结合设备数据给我节电建议'];
const DISMISS_KEY = 'electricity-assistant-dismissed';
const SETTINGS_KEY = 'electricity-assistant-settings';
const LAST_REMINDER_KEY = 'electricity-assistant-last-reminder';
const CONVERSATION_KEY = 'electricity-assistant-conversation-v1';
const REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_SAVED_MESSAGES = 30;
const PHASE_LABELS: Record<string, string> = {
  planning: '正在理解你的问题',
  planning_ai: '正在确认查询范围',
  reading: '正在读取最新用电数据',
  comparing: '正在比较近期正常水平',
  fallback: '主模型响应较慢，已切换备用服务',
  verifying: '正在核对数字并整理建议'
};

function readSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '') as { remindersEnabled: boolean };
  } catch {
    return { remindersEnabled: true };
  }
}

function readConversation(): ConversationItem[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONVERSATION_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && typeof item.id === 'string' && (item.role === 'user' || item.role === 'assistant')).slice(-MAX_SAVED_MESSAGES);
  } catch {
    return [];
  }
}

function canShowReminder(notification: AssistantNotification, remindersEnabled: boolean) {
  if (!remindersEnabled || notification.proactive === false) return false;
  const now = new Date();
  const dismissed = Number(window.localStorage.getItem(`${DISMISS_KEY}:${notification.id}`) || 0);
  if (dismissed >= Date.now()) return false;
  const lastShown = Number(window.localStorage.getItem(LAST_REMINDER_KEY) || 0);
  if (notification.severity !== 'critical' && Date.now() - lastShown < REMINDER_COOLDOWN_MS) return false;
  const beijingHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false
  }).format(now));
  return notification.severity === 'critical' || (beijingHour >= 8 && beijingHour < 22);
}

function chartIsRelevant(answer: AssistantAnswer) {
  const chart = answer.chart;
  const plan = answer.plan;
  if (!chart || chart.labels.length < 2 || !chart.series.some(series => series.values.some(value => Number.isFinite(value)))) return false;
  if (!plan) return true;
  if (plan.action === 'compare' || plan.action === 'trend' || plan.metric === 'peak') return true;
  if (plan.action === 'query') return plan.entities.length > 1 || plan.timeRange.kind === 'rolling_days' || plan.timeRange.kind === 'rolling_months';
  // A full-home hourly chart helps explain today's total change, but is misleading
  // for device-level explanations and generic saving recommendations.
  return plan.action === 'explain' && plan.entities.length === 1 && plan.entities[0] === 'total' && plan.timeRange.kind === 'today';
}

function AssistantChart({ answer }: { answer: AssistantAnswer }) {
  const option = useMemo(() => {
    if (!chartIsRelevant(answer) || !answer.chart) return null;
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
      series: answer.chart.series.map((series, index) => {
        const seriesColor = series.name.includes('空调') ? '#32ade6'
          : series.name.includes('热水器') ? '#ff9f0a'
          : series.name.includes('其他') ? '#8e8e93'
          : index === 0 ? '#0a84ff' : '#686864';
        const data = isBar && series.name === '今日用电' && answer.chart?.labels.length === series.values.length
          ? series.values.map((value, dataIndex) => ({
              value,
              itemStyle: { color: ['#32ade6', '#ff9f0a', '#8e8e93'][dataIndex] || seriesColor, borderRadius: [4, 4, 0, 0] }
            }))
          : series.values;
        return ({
        name: series.name,
        type: isBar ? 'bar' : 'line',
        data,
        smooth: !isBar,
        symbol: 'none',
        barMaxWidth: 18,
        itemStyle: { color: seriesColor, borderRadius: isBar ? [4, 4, 0, 0] : 0 },
        lineStyle: { width: index === 0 ? 2 : 1.5, type: index === 0 ? 'solid' : 'dashed' },
        areaStyle: !isBar && index === 0 ? { color: 'rgba(10,132,255,.08)' } : undefined
      });})
    };
  }, [answer]);

  if (!option) return null;
  return (
    <Suspense fallback={<div className="assistant-chart-placeholder">趋势图加载中…</div>}>
      <Chart
        ariaLabel="用电助手分析趋势图"
        summary="用电助手根据当前问题生成的趋势或对比图。"
        option={option}
        className="assistant-chart"
        opts={{ renderer: 'canvas' }}
      />
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
        <div className="assistant-section-label">结论</div>
        <div className="assistant-answer-heading">{answer.headline}</div>
        {answer.metric && (
          <div className="assistant-metric">
            <span>关键数字 · {answer.metric.label}</span>
            <strong>{answer.metric.value}<small>{answer.metric.unit}</small></strong>
          </div>
        )}
        <AssistantChart answer={answer} />
        {answer.evidence && (
          <div className="assistant-evidence">
            <div className="assistant-evidence-heading">判断依据</div>
            {answer.evidence.map(item => (
              <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
            ))}
          </div>
        )}
        <div className="assistant-section-label is-analysis">分析与建议</div>
        <AssistantBody text={answer.body} />
        <div className="assistant-source">
          <span>{answer.source}</span>
          {typeof answer.elapsedMs === 'number' && <span>用时 {(answer.elapsedMs / 1000).toFixed(1)} 秒</span>}
        </div>
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

export default function ElectricityAssistant({ initialBriefing }: { initialBriefing?: AssistantBriefing }) {
  const [briefing, setBriefing] = useState<AssistantBriefing | null>(initialBriefing || null);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reminderVisible, setReminderVisible] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(() => readSettings().remindersEnabled);
  const [conversation, setConversation] = useState<ConversationItem[]>(readConversation);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [assistantPhase, setAssistantPhase] = useState('planning');
  const [elapsedMs, setElapsedMs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const slowTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialBriefing) {
      setBriefing(initialBriefing);
      const shouldShow = canShowReminder(initialBriefing.notification, remindersEnabled);
      setReminderVisible(shouldShow);
      if (shouldShow) window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
      return undefined;
    }
    let active = true;
    fetchAPI<AssistantBriefing>('/api/assistant/briefing', {}, 60_000)
      .then(data => {
        if (!active) return;
        setBriefing(data);
        const shouldShow = canShowReminder(data.notification, remindersEnabled);
        setReminderVisible(shouldShow);
        if (shouldShow) window.localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()));
      })
      .catch(() => {
        if (active) setReminderVisible(false);
      });
    return () => { active = false; };
  }, [initialBriefing, remindersEnabled]);

  useEffect(() => {
    window.localStorage.setItem(CONVERSATION_KEY, JSON.stringify(conversation.slice(-MAX_SAVED_MESSAGES)));
  }, [conversation]);

  useEffect(() => {
    if (!isSending) return undefined;
    const startedAt = performance.now();
    setElapsedMs(0);
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 250);
    return () => window.clearInterval(timer);
  }, [isSending]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container && typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [conversation, isSending]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 180);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSettings(false);
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  useEffect(() => () => {
    if (slowTimerRef.current !== null) window.clearTimeout(slowTimerRef.current);
  }, []);

  const dismissReminder = (delayMs: number) => {
    if (briefing?.notification) {
      window.localStorage.setItem(`${DISMISS_KEY}:${briefing.notification.id}`, String(Date.now() + delayMs));
    }
    setReminderVisible(false);
  };

  const openWithQuestion = (question?: string) => {
    dismissReminder(24 * 60 * 60 * 1000);
    setIsOpen(true);
    setShowSettings(false);
    if (question) void sendQuestion(question);
  };

  const sendQuestion = async (rawQuestion: string, appendUser = true) => {
    const question = rawQuestion.trim();
    if (!question || isSending) return;
    setError(null);
    setIsSlow(false);
    setStreamingText('');
    setAssistantPhase('planning');
    setInput('');
    setIsOpen(true);
    if (appendUser) {
      setConversation(items => [...items, { id: `u-${Date.now()}`, role: 'user', text: question }]);
    }
    setIsSending(true);
    slowTimerRef.current = window.setTimeout(() => setIsSlow(true), 8000);
    try {
      const history = conversation.slice(-10).map(item => item.role === 'user'
        ? { role: 'user', content: item.text || '' }
        : {
            role: 'assistant',
            content: item.answer ? `${item.answer.headline}\n${item.answer.body}` : '',
            plan: item.answer?.plan
          });
      let completedAnswer: AssistantAnswer | null = null;
      let receivedDelta = false;
      try {
        await streamAPI<{ text?: string; answer?: AssistantAnswer; phase?: string }>(
          '/api/assistant/chat/stream',
          { message: question, history },
          event => {
            if (event.event === 'status' && event.data.phase) setAssistantPhase(event.data.phase);
            if (event.event === 'delta' && event.data.text) {
              receivedDelta = true;
              setStreamingText(text => text + event.data.text);
            }
            if (event.event === 'done' && event.data.answer) completedAnswer = event.data.answer;
            if (event.event === 'error') throw new Error('AI 服务暂时不可用');
          },
          60_000
        );
      } catch (streamError) {
        if (receivedDelta) throw streamError;
        completedAnswer = await fetchAPI<AssistantAnswer>('/api/assistant/chat', {
          method: 'POST',
          body: JSON.stringify({ message: question, history })
        }, 60_000);
      }
      if (!completedAnswer) throw new Error('AI 返回内容不完整');
      setConversation(items => [...items, { id: `a-${Date.now()}`, role: 'assistant', answer: completedAnswer as AssistantAnswer }]);
      setLastFailedQuestion('');
    } catch (requestError) {
      setError(formatErrorMessage(requestError));
      setLastFailedQuestion(question);
    } finally {
      if (slowTimerRef.current !== null) window.clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
      setIsSlow(false);
      setIsSending(false);
      setStreamingText('');
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
          <span className="assistant-reminder-kicker">智能提醒 · {briefing.notification.type === 'device' ? '米家设备' : briefing.notification.type === 'balance' ? '余额风险' : '全屋用电'}</span>
          <strong>{briefing.notification.title}</strong>
          <p>{briefing.notification.message}</p>
          <div>
            <button className="assistant-text-action is-primary" type="button" onClick={() => openWithQuestion(briefing.notification.prompt)}>{briefing.notification.actionLabel}</button>
            <button className="assistant-text-action" type="button" onClick={() => dismissReminder(4 * 60 * 60 * 1000)}>稍后提醒</button>
          </div>
        </aside>
      )}

      {isOpen && (
        <aside className="assistant-panel" role="dialog" aria-modal="false" aria-label="布布用电助手">
          <div className="assistant-drag-handle" aria-hidden="true" />
          <header className="assistant-panel-header">
            <div className="assistant-identity">
              <img src={bubuIcon} alt="" />
              <div><strong>布布用电助手</strong><span>{briefing?.aiConfigured ? 'AI 已连接' : '数据查询模式'}</span></div>
            </div>
            <div className="assistant-panel-actions">
              {conversation.length > 0 && <button type="button" onClick={() => setConversation([])}>清空对话</button>}
              <button type="button" onClick={() => setShowSettings(value => !value)} aria-expanded={showSettings}>提醒设置</button>
              <button type="button" onClick={() => setIsOpen(false)}>关闭</button>
            </div>
          </header>

          {showSettings ? (
            <div className="assistant-settings">
              <h3>提醒设置</h3>
              <label>
                <span><strong>主动用电提醒</strong><small>设备异常、全屋增长和低余额提醒</small></span>
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
                    <span>直接读取全屋电表与米家设备数据，复杂问题再由 AI 解释。</span>
                    <div className="assistant-mode-entry">
                      <button type="button" onClick={() => void sendQuestion('查看空调和热水器用电')}><strong>查设备用电</strong><span>空调、热水器与其他电器</span></button>
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
                {streamingText && (
                  <div className="assistant-response-row is-streaming" aria-live="polite">
                    <img src={bubuIcon} alt="" />
                    <div className="assistant-streaming-copy"><AssistantBody text={streamingText} /></div>
                  </div>
                )}
                {isSending && (
                  <div className="assistant-loading" role="status">
                    <span>{streamingText ? '正在呈现已核对的分析' : isSlow && assistantPhase !== 'fallback' ? '分析时间稍长，正在继续处理' : PHASE_LABELS[assistantPhase] || '正在整理回答'}</span>
                    <strong>{(elapsedMs / 1000).toFixed(1)} 秒</strong>
                  </div>
                )}
                {error && (
                  <div className="assistant-error" role="alert">
                    <span>{error}</span>
                    {lastFailedQuestion && <button type="button" onClick={() => void sendQuestion(lastFailedQuestion, false)}>重试</button>}
                    <button type="button" onClick={() => setError(null)}>关闭</button>
                  </div>
                )}
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
