import React, { useRef, useState, useEffect } from "react";
import { render, Box, Text, useBoxMetrics, type DOMElement } from "ink";

function BoxMetricsDemo() {
  const outerRef = useRef<DOMElement>(null!);
  const innerRef = useRef<DOMElement>(null!);
  const outer = useBoxMetrics(outerRef);
  const inner = useBoxMetrics(innerRef);

  const [lines, setLines] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setLines((prev) => (prev >= 5 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const content = Array.from({ length: lines }, (_, i) => `Line ${i + 1}`).join("\n");

  return (
    <Box ref={outerRef} flexDirection="column" padding={1}>
      <Text bold>useBoxMetrics demo</Text>
      <Text dimColor>Resize your terminal or wait for content changes</Text>
      <Text> </Text>

      <Box ref={innerRef} borderStyle="round" paddingX={1} flexDirection="column">
        <Text>{content}</Text>
      </Box>

      <Text> </Text>
      <Text color="cyan">
        Outer box: {outer.width}x{outer.height} at ({outer.left},{outer.top})
        {outer.hasMeasured ? "" : " (measuring...)"}
      </Text>
      <Text color="yellow">
        Inner box: {inner.width}x{inner.height} at ({inner.left},{inner.top})
        {inner.hasMeasured ? "" : " (measuring...)"}
      </Text>
    </Box>
  );
}

render(<BoxMetricsDemo />);
