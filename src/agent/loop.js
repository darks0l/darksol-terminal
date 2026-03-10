export const DEFAULT_MAX_STEPS = 10;

function normalizeDecision(raw, fallbackStep) {
  if (!raw || typeof raw !== 'object') {
    return {
      thought: 'No structured response returned.',
      action: 'finish',
      actionInput: {},
      final: 'Agent stopped because the model did not return valid JSON.',
      stop: true,
      stopReason: 'invalid_response',
    };
  }

  return {
    thought: String(raw.thought || '').trim() || `Step ${fallbackStep}`,
    action: String(raw.action || 'finish').trim(),
    actionInput: raw.actionInput && typeof raw.actionInput === 'object' ? raw.actionInput : {},
    final: raw.final ? String(raw.final).trim() : '',
    stop: Boolean(raw.stop),
    stopReason: raw.stopReason ? String(raw.stopReason).trim() : '',
  };
}

function sameAction(a, b) {
  return a && b && a.action === b.action && JSON.stringify(a.actionInput || {}) === JSON.stringify(b.actionInput || {});
}

function buildPrompt({ goal, allowActions, maxSteps, stepNumber, tools, steps }) {
  const history = steps.length === 0
    ? 'No prior steps yet.'
    : steps.map((step) => {
      const bits = [
        `Step ${step.step}`,
        `thought=${step.thought}`,
        `action=${step.action}`,
        `input=${JSON.stringify(step.actionInput || {})}`,
        step.observation ? `observation=${step.observation}` : '',
      ].filter(Boolean);
      return bits.join('\n');
    }).join('\n\n');

  return [
    'You are the DARKSOL agent loop controller.',
    `Goal: ${goal}`,
    `Current step: ${stepNumber}/${maxSteps}`,
    `Safe mode: ${allowActions ? 'off' : 'on'}${allowActions ? '' : ' (mutating tools are blocked)'}`,
    'Available tools:',
    tools.map((tool) => `- ${tool.name}${tool.mutating ? ' [mutating]' : ''}: ${tool.description}`).join('\n'),
    'Prior step log:',
    history,
    'Rules:',
    '- Think briefly and act conservatively.',
    '- Use read-only tools first unless the goal clearly requires an action and actions are allowed.',
    '- If you have enough information, return action "finish" with a concise final answer.',
    '- If the last tool was blocked or failed, adjust instead of repeating forever.',
    '- Respond as JSON only.',
    'JSON schema:',
    '{"thought":"string","action":"tool-name|finish","actionInput":{},"final":"string","stop":false,"stopReason":"string"}',
  ].join('\n\n');
}

export async function runAgentLoop({
  goal,
  llm,
  tools,
  executeTool,
  maxSteps = DEFAULT_MAX_STEPS,
  allowActions = false,
  onProgress = () => {},
  saveOutcome = async () => {},
  persistStatus = async () => {},
}) {
  const startedAt = new Date().toISOString();
  const steps = [];

  await persistStatus({
    status: 'running',
    goal,
    allowActions,
    maxSteps,
    startedAt,
    completedAt: null,
    stepsTaken: 0,
    summary: '',
  });

  for (let stepNumber = 1; stepNumber <= maxSteps; stepNumber += 1) {
    const prompt = buildPrompt({ goal, allowActions, maxSteps, stepNumber, tools, steps });
    onProgress({ type: 'step-start', step: stepNumber, maxSteps });

    const response = await llm.json(prompt, {
      ephemeral: true,
      skipMemoryExtraction: true,
    });
    const decision = normalizeDecision(response.parsed, stepNumber);
    const stepLog = {
      step: stepNumber,
      thought: decision.thought,
      action: decision.action,
      actionInput: decision.actionInput,
      observation: '',
    };
    steps.push(stepLog);
    onProgress({ type: 'thought', step: stepNumber, thought: decision.thought, action: decision.action, actionInput: decision.actionInput });

    const previous = steps.length > 1 ? steps[steps.length - 2] : null;
    const repeatedLoop = sameAction(stepLog, previous) && sameAction(previous, steps.length > 2 ? steps[steps.length - 3] : null);
    if (repeatedLoop) {
      const completedAt = new Date().toISOString();
      const result = {
        status: 'stopped',
        goal,
        allowActions,
        maxSteps,
        startedAt,
        completedAt,
        stepsTaken: steps.length,
        stopReason: 'repeat_guard',
        final: 'Agent stopped after repeating the same step three times.',
        steps,
      };
      await persistStatus({ ...result, summary: result.final });
      await saveOutcome(result);
      return result;
    }

    if (decision.stop || decision.action === 'finish' || decision.final) {
      const completedAt = new Date().toISOString();
      const final = decision.final || 'Agent stopped without a final answer.';
      const result = {
        status: 'completed',
        goal,
        allowActions,
        maxSteps,
        startedAt,
        completedAt,
        stepsTaken: steps.length,
        stopReason: decision.stopReason || 'final',
        final,
        steps,
      };
      await persistStatus({ ...result, summary: final });
      await saveOutcome(result);
      onProgress({ type: 'final', final });
      return result;
    }

    const observation = await executeTool(decision.action, decision.actionInput || {});
    stepLog.observation = observation.summary || observation.error || JSON.stringify(observation);
    stepLog.result = observation;
    onProgress({ type: 'observation', step: stepNumber, tool: decision.action, observation });

    if (observation.blocked) {
      stepLog.observation = observation.error;
    }

    await persistStatus({
      status: 'running',
      goal,
      allowActions,
      maxSteps,
      startedAt,
      completedAt: null,
      stepsTaken: steps.length,
      lastTool: decision.action,
      lastObservation: stepLog.observation,
      summary: '',
    });
  }

  const completedAt = new Date().toISOString();
  const final = `Agent reached the step limit (${maxSteps}) before finishing.`;
  const result = {
    status: 'stopped',
    goal,
    allowActions,
    maxSteps,
    startedAt,
    completedAt,
    stepsTaken: steps.length,
    stopReason: 'max_steps',
    final,
    steps,
  };
  await persistStatus({ ...result, summary: final });
  await saveOutcome(result);
  onProgress({ type: 'final', final });
  return result;
}
