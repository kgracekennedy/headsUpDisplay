export function getSlidePillState(slideId, currentSlideId, rotatingSlideIds) {
  const selected = slideId === currentSlideId;
  const inRotation = rotatingSlideIds.has(slideId);
  const selectedSlideInRotation =
    currentSlideId !== null && currentSlideId !== undefined && rotatingSlideIds.has(currentSlideId);

  if (selected && inRotation) {
    return "selected-rotating";
  }

  if (selected) {
    return "selected-out-of-rotation";
  }

  if (inRotation && selectedSlideInRotation) {
    return "outlined";
  }

  return "neutral";
}

export function getSlidePillClassNames(slideId, currentSlideId, rotatingSlideIds) {
  const visualState = getSlidePillState(slideId, currentSlideId, rotatingSlideIds);

  const classNames = ["slide-pill", `slide-pill--${visualState}`];

  if (slideId === currentSlideId) {
    classNames.push("slide-pill--selected");
  }

  return classNames.join(" ");
}
