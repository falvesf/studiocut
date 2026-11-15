/**
 * Uploads a media file with real-time progress across:
 * 1) File transfer (XHR upload progress)
 * 2) Codec probing (SSE)
 * 3) Hardware/CPU transcoding to browser-playable H.264/AAC (SSE)
 */
export function uploadMediaWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let evtSource = null;

    const cleanup = () => {
      if (evtSource) {
        try {
          evtSource.close();
        } catch (e) {}
        evtSource = null;
      }
    };

    if (typeof EventSource !== 'undefined') {
      evtSource = new EventSource(`/api/upload-progress/${encodeURIComponent(uploadId)}`);
      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onProgress?.({
            fileName: file.name,
            stage: data.stage || 'probing',
            percent: Number(data.percent) || 0,
            codec: data.codec || null,
            encoder: data.encoder || null,
            message: data.message || 'Processando vídeo...'
          });
        } catch (e) {}
      };
    }

    onProgress?.({
      fileName: file.name,
      stage: 'uploading',
      percent: 0,
      message: `Carregando "${file.name}"...`
    });

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?uploadId=${encodeURIComponent(uploadId)}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
        onProgress?.({
          fileName: file.name,
          stage: 'uploading',
          percent: pct,
          message: pct >= 99
            ? 'Arquivo recebido. Analisando codec e metadados...'
            : `Enviando arquivo para o editor... ${pct}%`
        });
      }
    };

    xhr.onload = () => {
      cleanup();
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve(data);
        } else {
          reject(new Error(data.error || `Erro HTTP ${xhr.status}`));
        }
      } catch (err) {
        reject(new Error('Resposta inválida do servidor durante a importação.'));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('Erro de conexão ao enviar o arquivo.'));
    };

    xhr.send(formData);
  });
}
