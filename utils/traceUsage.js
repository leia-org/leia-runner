function validCount(count) {
  return Number.isSafeInteger(count) && count >= 0;
}

function usageDetails(response, provider) {
  const usage = response?.usage ?? response?.usageMetadata;
  let input = usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.total_input_tokens
    ?? usage?.promptTokenCount ?? response?.prompt_eval_count;
  let output = usage?.output_tokens ?? usage?.completion_tokens ?? usage?.total_output_tokens
    ?? usage?.candidatesTokenCount ?? response?.eval_count;
  const total = usage?.total_tokens ?? usage?.totalTokenCount;
  const cached = usage?.input_tokens_details?.cached_tokens ?? usage?.prompt_tokens_details?.cached_tokens
    ?? usage?.total_cached_tokens ?? usage?.cachedContentTokenCount;
  const thinking = usage?.total_thought_tokens ?? usage?.thoughtsTokenCount;

  const counts = {};
  if (validCount(input) && validCount(cached) && cached > 0 && cached <= input) {
    counts.input_cached_tokens = cached;
    input -= cached;
  }

  // Gemini reports thinking separately. OpenAI's completion count already includes it.
  if (provider === 'gemini' && validCount(output) && validCount(thinking)) {
    const countedInput = validCount(input) ? input + (counts.input_cached_tokens ?? 0) : 0;
    if (!validCount(total) || countedInput + output + thinking <= total) output += thinking;
  }

  if (validCount(input)) counts.input = input;
  if (validCount(output)) counts.output = output;
  if (validCount(total)) counts.total = total;
  return counts;
}

module.exports = { usageDetails };
