export const RENDER_CONTRACTS = {
  classes: {
    aiResponse: "aiResponseContent",
    chatBubble: "chat-bubble",
    prose: "prose",
    markdownBody: "markdown-body"
  },
  selectors: {
    aiResponse: ".aiResponseContent",
    chatBubble: ".chat-bubble",
    assistantBubble: '[data-render-contract="chat-bubble"][data-role="assistant"]',
    prose: ".prose",
    markdownBody: ".markdown-body",
    answerContent: ".aiResponseContent, .prose, .markdown-body"
  },
  visibility: {
    minHeight: 1,
    minWidth: 1
  }
} as const;

export type RenderContractFailureReason =
  | "MISSING_DOM_NODE"
  | "UNMOUNTED_AFTER_RENDER"
  | "ZERO_HEIGHT"
  | "HIDDEN_BY_CSS"
  | "EMPTY_CONTENT"
  | "VISIBILITY_BLOCKED"
  | "OVERFLOW_CLIPPED"
  | "RENDER_GUARD_BLOCKED"
  | "STATE_OVERWRITTEN";

export interface RenderVerificationResult {
  selector: string;
  success: boolean;
  reason?: RenderContractFailureReason;
  height: number;
  width: number;
  visible: boolean;
  isMounted: boolean;
  textContent: string;
  contractStatus: "OK" | "FAIL";
  clipped: boolean;
}

function getTextContent(element: HTMLElement): string {
  return element.textContent?.trim() ?? "";
}

function isClipped(element: HTMLElement): boolean {
  const parent = element.parentElement;
  if (!parent) {
    return false;
  }

  const parentStyle = window.getComputedStyle(parent);
  const overflow = `${parentStyle.overflow} ${parentStyle.overflowX} ${parentStyle.overflowY}`.toLowerCase();
  if (!overflow.includes("hidden") && !overflow.includes("clip")) {
    return false;
  }

  const elementRect = element.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  return (
    elementRect.top < parentRect.top ||
    elementRect.left < parentRect.left ||
    elementRect.right > parentRect.right ||
    elementRect.bottom > parentRect.bottom
  );
}

export function verifyRenderNode(selector: string): RenderVerificationResult {
  const element = document.querySelector(selector) as HTMLElement | null;

  if (!element) {
    return {
      selector,
      success: false,
      reason: "MISSING_DOM_NODE",
      height: 0,
      width: 0,
      visible: false,
      isMounted: false,
      textContent: "",
      contractStatus: "FAIL",
      clipped: false
    };
  }

  if (!element.isConnected) {
    return {
      selector,
      success: false,
      reason: "UNMOUNTED_AFTER_RENDER",
      height: 0,
      width: 0,
      visible: false,
      isMounted: false,
      textContent: getTextContent(element),
      contractStatus: "FAIL",
      clipped: false
    };
  }

  const styles = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const height = Math.round(rect.height);
  const width = Math.round(rect.width);
  const textContent = getTextContent(element);
  const clipped = isClipped(element);

  const hiddenByCss =
    styles.display === "none" ||
    styles.visibility === "hidden" ||
    styles.opacity === "0";

  if (hiddenByCss) {
    return {
      selector,
      success: false,
      reason: "HIDDEN_BY_CSS",
      height,
      width,
      visible: false,
      isMounted: true,
      textContent,
      contractStatus: "FAIL",
      clipped
    };
  }

  if (height < RENDER_CONTRACTS.visibility.minHeight || width < RENDER_CONTRACTS.visibility.minWidth) {
    return {
      selector,
      success: false,
      reason: "ZERO_HEIGHT",
      height,
      width,
      visible: false,
      isMounted: true,
      textContent,
      contractStatus: "FAIL",
      clipped
    };
  }

  if (!textContent) {
    return {
      selector,
      success: false,
      reason: "EMPTY_CONTENT",
      height,
      width,
      visible: false,
      isMounted: true,
      textContent,
      contractStatus: "FAIL",
      clipped
    };
  }

  if (clipped) {
    return {
      selector,
      success: false,
      reason: "OVERFLOW_CLIPPED",
      height,
      width,
      visible: false,
      isMounted: true,
      textContent,
      contractStatus: "FAIL",
      clipped: true
    };
  }

  return {
    selector,
    success: true,
    height,
    width,
    visible: true,
    isMounted: true,
    textContent,
    contractStatus: "OK",
    clipped: false
  };
}
