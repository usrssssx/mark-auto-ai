function scoreBudget(budgetMinUsd) {
  if (budgetMinUsd == null) return 0;
  if (budgetMinUsd >= 3000) return 40;
  if (budgetMinUsd >= 1000) return 25;
  return 10;
}

function scoreTimeline(timelineDays) {
  if (timelineDays == null) return 0;
  if (timelineDays <= 30) return 25;
  if (timelineDays <= 60) return 15;
  return 5;
}

function scoreServiceType(serviceType) {
  return serviceType ? 20 : 0;
}

function scoreDecisionMaker(isDecisionMaker) {
  return isDecisionMaker === true ? 15 : 0;
}

export function scoreLead(qualification) {
  const breakdown = {
    budget: scoreBudget(qualification.budgetMinUsd),
    timeline: scoreTimeline(qualification.timelineDays),
    serviceType: scoreServiceType(qualification.serviceType),
    decisionMaker: scoreDecisionMaker(qualification.isDecisionMaker),
  };

  const score = Math.min(
    100,
    breakdown.budget +
      breakdown.timeline +
      breakdown.serviceType +
      breakdown.decisionMaker,
  );

  let temperature = "cold";
  if (score >= 75) {
    temperature = "hot";
  } else if (score >= 45) {
    temperature = "warm";
  }

  return {
    score,
    temperature,
    breakdown,
  };
}

