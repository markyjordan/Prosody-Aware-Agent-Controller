class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = true;
    this.port.onmessage = (event) => {
      if (event.data === "stop") {
        this.active = false;
        this.port.postMessage("stopped");
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (this.active && input && input[0]) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
