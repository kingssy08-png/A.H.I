function toNotebookLines(code: string): string[] {
  const lines = code.split('\n');
  return lines.map((line, index) => (index < lines.length - 1 ? `${line}\n` : line));
}

export const COLAB_WAN21_PYTHON_SNIPPET = `!pip install -q --upgrade diffusers transformers accelerate imageio[ffmpeg] ftfy gradio
import tempfile
import torch
import gradio as gr
from diffusers import AutoencoderKLWan, WanPipeline
from diffusers.utils import export_to_video

model_id = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)
pipe = WanPipeline.from_pretrained(model_id, vae=vae, torch_dtype=torch.bfloat16)
pipe.enable_model_cpu_offload()

def generate_video(prompt: str, num_inference_steps: int = 24, guidance_scale: float = 5.0):
    output = pipe(
        prompt=prompt,
        negative_prompt="blurry, low quality, distorted, watermark, text overlay",
        height=480,
        width=832,
        num_frames=49,
        num_inference_steps=int(num_inference_steps),
        guidance_scale=float(guidance_scale),
    ).frames[0]
    out_path = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
    export_to_video(output, out_path, fps=16)
    return out_path

demo = gr.Interface(
    fn=generate_video,
    inputs=[
        gr.Textbox(label="prompt", placeholder="Describe your video scene..."),
        gr.Slider(minimum=8, maximum=40, value=24, step=1, label="num_inference_steps"),
        gr.Slider(minimum=1.0, maximum=10.0, value=5.0, step=0.5, label="guidance_scale"),
    ],
    outputs=gr.Video(label="video"),
    title="A.H.I Studio — Private Wan 2.1 Colab Turbo GPU",
)

demo.queue().launch(share=True, debug=True)`;

export function buildWan21ColabNotebookJson(): string {
  const markdownCell = [
    '# A.H.I Studio — Free Private Colab GPU (Wan 2.1)',
    '',
    'Run unlimited, zero-queue, watermark-free AI video generation on Google Colab’s free T4 GPU:',
    '1. Open **Runtime → Change runtime type** and select **T4 GPU**.',
    '2. Click **Runtime → Run all**.',
    '3. Copy the **`https://xxxx.gradio.live`** URL printed in the last cell and paste it into **A.H.I → Engine & Server Details → Private Colab GPU URL**.',
  ].join('\n');

  const installCell =
    '!pip install -q --upgrade diffusers transformers accelerate imageio[ffmpeg] ftfy gradio';

  const launchCell = COLAB_WAN21_PYTHON_SNIPPET.split('\n').slice(1).join('\n');

  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      colab: {
        provenance: [],
        gpuType: 'T4',
      },
      kernelspec: {
        name: 'python3',
        display_name: 'Python 3',
      },
      language_info: {
        name: 'python',
      },
      accelerator: 'GPU',
    },
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: toNotebookLines(markdownCell),
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: toNotebookLines(installCell),
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: toNotebookLines(launchCell),
      },
    ],
  };

  return JSON.stringify(notebook, null, 2);
}

export function downloadWan21ColabNotebook(): void {
  const json = buildWan21ColabNotebookJson();
  const blob = new Blob([json], { type: 'application/x-ipynb+json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'AHI_Wan2_1_Colab_GPU.ipynb';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
