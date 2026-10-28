(() => {
    "use strict";

    class UploadBatch {
        constructor(identifier, files, epoch = 0) {
            this.id = identifier;
            this.epoch = epoch;
            this.files = files.map(file => ({ name: file.name, size: file.size }));
            this.total = this.files.reduce((sum, file) => sum + file.size, 0);
            this.received = new Map();
            this.observed = false;
            this.state = "uploading";
            this.error = "";
            this.paths = null;
            this.responseSequence = null;
            this.transferComplete = false;
            this.currentName = "";
        }
        receive(name, count) {
            if (this.state !== "uploading" || !Number.isFinite(count) || count <= 0) return;
            const total = this.files.filter(file => file.name === name)
                .reduce((sum, file) => sum + file.size, 0);
            if (!total) return;
            this.observed = true;
            this.currentName = name;
            this.received.set(name, Math.min(total, (this.received.get(name) || 0) + count));
        }
        get loaded() {
            if (this.transferComplete) return this.total;
            return [...this.received.values()].reduce((sum, count) => sum + count, 0);
        }
        get percent() {
            if (this.transferComplete) return 100;
            return this.observed && this.total ? Math.min(99, Math.floor(100 * this.loaded / this.total)) : null;
        }
        get completed() {
            // Progress samples are not per-file acknowledgements, especially
            // when several selected files share a name.
            return this.transferComplete ? this.files.length : 0;
        }
        accepted(paths) {
            if (this.state !== "uploading") return false;
            if (!Array.isArray(paths) || paths.length !== this.files.length ||
                paths.some(path => typeof path !== "string" || !path)) return false;
            this.paths = new Set(paths);
            this.transferComplete = true;
            this.state = "adding";
            this.observed = true;
            this.received.clear();
            this.files.forEach(file => this.received.set(file.name,
                (this.received.get(file.name) || 0) + file.size));
            return true;
        }
        ready() {
            if (this.transferComplete) {
                this.state = "ready";
                this.error = "";
            }
        }
        fail(message) {
            if (this.state !== "ready") {
                this.state = "failed";
                this.error = message;
            }
        }
    }

    function filePaths(files) {
        if (!Array.isArray(files)) return null;
        const paths = files.map(file => typeof file === "string" ? file : file && file.path);
        return paths.every(path => typeof path === "string" && path) ? new Set(paths) : null;
    }

    class UploadTracker {
        constructor() {
            this.epoch = 0;
            this.sequence = 0;
            this.batches = new Map();
            this.requests = new Set();
            this.events = new Map();
            this.earlyCompletions = new Map();
        }
        get pending() {
            return [...this.requests].some(request => request.result === null);
        }
        get active() {
            return this.pending || [...this.batches.values()]
                .some(batch => batch.state === "uploading" || batch.state === "adding");
        }
        current(batch) {
            return batch.epoch === this.epoch && this.batches.get(batch.id) === batch;
        }
        clear(newPage = true) {
            for (const batch of this.batches.values()) {
                batch.progressController?.abort();
            }
            this.batches.clear();
            this.requests.clear();
            this.events.clear();
            this.earlyCompletions.clear();
            if (newPage) this.epoch++;
        }
        begin(identifier, files) {
            // A new transfer replaces settled feedback, not the server's
            // pending attachments. Existing joins cannot confirm a new batch.
            if (!this.active) this.clear(false);
            const batch = new UploadBatch(identifier, files, this.epoch);
            this.batches.set(identifier, batch);
            return batch;
        }
        received(batch) {
            if (!this.current(batch)) return;
            batch.responseSequence = ++this.sequence;
        }
        accepted(batch, paths) {
            if (!this.current(batch)) return false;
            if (batch.responseSequence === null) this.received(batch);
            if (!batch.accepted(paths)) return false;
            this.reconcile();
            return true;
        }
        join(files) {
            const paths = filePaths(files);
            if (!paths || !paths.size) return null;
            const request = { epoch: this.epoch, sequence: ++this.sequence,
                paths, result: null, error: "附件未能加入待发送列表，请重试" };
            this.requests.add(request);
            return request;
        }
        register(request, identifier) {
            if (request.epoch !== this.epoch || !this.requests.has(request)) return;
            if (typeof identifier !== "string" || !identifier) {
                this.fail(request, "附件确认响应不完整，请重试");
                return;
            }
            if (!this.events.has(identifier)) this.events.set(identifier, new Set());
            this.events.get(identifier).add(request);
            if (this.earlyCompletions.has(identifier)) {
                this.complete(identifier, this.earlyCompletions.get(identifier));
            }
        }
        fail(request, message) {
            if (request.epoch !== this.epoch || !this.requests.has(request)) return;
            request.result = false;
            request.error = message;
            this.reconcile();
        }
        complete(identifier, success) {
            const requests = this.events.get(identifier);
            if (!requests) {
                this.earlyCompletions.set(identifier, success === true);
                while (this.earlyCompletions.size > 64) {
                    this.earlyCompletions.delete(this.earlyCompletions.keys().next().value);
                }
                return;
            }
            this.earlyCompletions.delete(identifier);
            for (const request of requests) request.result = success === true;
            this.reconcile();
        }
        covers(request, batch) {
            return request.epoch === batch.epoch && batch.responseSequence !== null &&
                request.sequence >= batch.responseSequence && batch.paths &&
                [...batch.paths].every(path => request.paths.has(path));
        }
        reconcile() {
            for (const batch of this.batches.values()) {
                if (!batch.transferComplete || batch.state === "ready") continue;
                const requests = [...this.requests].filter(request => this.covers(request, batch));
                if (requests.some(request => request.result === true)) batch.ready();
                else if (requests.length && requests.every(request => request.result === false)) {
                    batch.fail(requests[requests.length - 1].error);
                }
            }
        }
    }

    function parseEvents(buffer) {
        const frames = buffer.split(/\r?\n\r?\n/);
        const rest = frames.pop();
        const events = [];
        for (const frame of frames) {
            const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:"))
                .map(line => line.slice(5).trimStart()).join("\n");
            if (!data) continue;
            try { events.push(JSON.parse(data)); } catch {}
        }
        return { events, rest: rest.length <= 262144 ? rest : "" };
    }

    function install() {
        if (window.__matagentUploadFeedbackInstalled) return;
        window.__matagentUploadFeedbackInstalled = true;
        const originalFetch = window.fetch.bind(window);
        const tracker = new UploadTracker();
        const batches = tracker.batches;
        let selected = null;
        let selectionPending = false;
        let pendingSelection = [];
        let selectionVersion = 0;
        let selectionTimer;
        let stopWasRevealing = false;
        const blocked = () => selectionPending || tracker.active;
        const sendBlocked = () => blocked() || [...batches.values()].some(batch => batch.state === "failed");

        const style = document.createElement("style");
        style.textContent = `
            #matagent-upload-feedback {flex:0 0 auto; margin:2px 8px; padding:8px 12px;
                border:1px solid #dce7f3; border-radius:12px; background:#f7faff;
                color:#42536b; font-size:12px; line-height:1.6;}
            #matagent-upload-feedback[hidden] {display:none!important;}
            #matagent-upload-feedback progress {display:block; width:100%; height:7px;
                margin:6px 0; accent-color:#3765e8; border-radius:8px;}
            #matagent-upload-feedback[data-error="true"] {background:#fff7f5; border-color:#efcfc6; color:#9c4431;}
            .matagent-uploading #send-button,.matagent-uploading #clear-upload,
            .matagent-uploading #new-chat {opacity:.45!important; cursor:wait!important;}
            .matagent-upload-failed #send-button {opacity:.45!important; cursor:not-allowed!important;}
        `;
        document.head.appendChild(style);

        function mount() {
            let element = document.getElementById("matagent-upload-feedback");
            if (element) return element;
            const attachments = document.querySelector(".attachment-status");
            if (!attachments) return null;
            element = document.createElement("section");
            element.id = "matagent-upload-feedback";
            element.hidden = true;
            const title = document.createElement("div");
            title.dataset.part = "title";
            title.setAttribute("role", "status");
            title.setAttribute("aria-live", "polite");
            const progress = document.createElement("progress");
            progress.max = 100;
            progress.setAttribute("aria-label", "文件上传进度");
            const details = document.createElement("div");
            details.dataset.part = "details";
            element.append(title, progress, details);
            attachments.before(element);
            return element;
        }

        function syncStop() {
            document.querySelectorAll('[aria-label*="matagent-reveal"]').forEach(element => {
                const label = element.getAttribute("aria-label") || "";
                const cleaned = label.replace(/<span hidden class="matagent-reveal marker-[A-Za-z0-9-]+"><\/span>/g, "");
                if (cleaned !== label) element.setAttribute("aria-label", cleaned);
            });
            const showing = !!document.querySelector(".matagent-reveal");
            const stop = document.querySelector("#stop-button button,button#stop-button");
            if (stop && showing) {
                if (stop.disabled) stop.disabled = false;
            } else if (stop && stopWasRevealing) {
                stop.disabled = true;
            }
            stopWasRevealing = showing;
        }

        function render() {
            const element = mount();
            const list = [...batches.values()];
            document.documentElement.classList.toggle("matagent-uploading", blocked());
            document.documentElement.classList.toggle("matagent-upload-failed", list.some(batch => batch.state === "failed"));
            document.querySelectorAll("#send-button,#clear-upload,#new-chat").forEach(control => {
                if (control.id === "send-button" ? sendBlocked() : blocked()) control.setAttribute("aria-disabled", "true");
                else control.removeAttribute("aria-disabled");
            });
            if (!element) return;
            element.hidden = !list.length && !selectionPending;
            const failed = list.filter(batch => batch.state === "failed");
            const adding = tracker.pending || list.some(batch => batch.state === "adding");
            const transferring = list.some(batch => batch.state === "uploading");
            const total = list.reduce((sum, batch) => sum + batch.total, 0);
            const loaded = list.reduce((sum, batch) => sum + Math.min(batch.total, batch.loaded), 0);
            const files = list.reduce((sum, batch) => sum + batch.files.length, 0);
            const completed = list.reduce((sum, batch) => sum + batch.completed, 0);
            const allObserved = list.length > 0 && list.every(batch => batch.observed);
            const allAccepted = list.length > 0 && list.every(batch => batch.transferComplete);
            const percentage = allAccepted ? 100 : allObserved && total ? Math.min(100, Math.floor(100 * loaded / total)) : null;
            const title = element.querySelector('[data-part="title"]');
            let message;
            if (failed.length) message = failed[0].error + (transferring || adding ? "；其余附件继续上传" : "");
            else if (selectionPending) message = "正在准备上传…";
            else if (transferring) {
                const current = list.find(batch => batch.state === "uploading");
                message = current.currentName ? `正在上传：${current.currentName}` : "正在上传文件…";
            }
            else if (adding) message = "传输完成，正在加入待发送附件…";
            else message = "上传完成，待发送";
            if (title.textContent !== message) title.textContent = message;
            element.dataset.error = String(failed.length > 0);
            const progress = element.querySelector("progress");
            if (percentage === null) progress.removeAttribute("value");
            else progress.value = percentage;
            const size = count => `${(count / (1024 * 1024)).toFixed(2)} MB`;
            const details = element.querySelector('[data-part="details"]');
            details.textContent = list.length
                ? `${percentage === null ? "等待服务器进度" : `${percentage}% · 已传 ${size(loaded)} / ${size(total)}`} · 本批已接收 ${completed}/${files} 个文件`
                : `已选择 ${selected ? selected.length : 0} 个文件`;
        }

        function settle() {
            syncStop();
        }

        function uploadFunction(index) {
            const config = window.gradio_config;
            if (!config) return false;
            const ids = new Set(config.components.filter(component => component.props.elem_id === "pdf-upload")
                .map(component => component.id));
            return config.dependencies.some(dependency => dependency.id === index
                && dependency.targets.some(target => ids.has(target[0]) && target[1] === "upload"));
        }

        function resetFeedback() {
            tracker.clear();
            selected = null;
            pendingSelection = [];
            selectionPending = false;
            selectionVersion++;
            clearTimeout(selectionTimer);
            render();
        }

        function transferStarted(files) {
            for (const file of files) {
                const index = pendingSelection.findIndex(item => item.name === file.name && item.size === file.size);
                if (index >= 0) pendingSelection.splice(index, 1);
            }
            if (!pendingSelection.length) {
                selectionPending = false;
                clearTimeout(selectionTimer);
            }
        }

        async function observeStream(response, handler) {
            let reader;
            try {
                reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                    const next = await reader.read();
                    if (next.done) break;
                    buffer += decoder.decode(next.value, { stream: true });
                    const parsed = parseEvents(buffer);
                    buffer = parsed.rest;
                    parsed.events.forEach(handler);
                }
            } catch {} finally {
                if (reader) reader.releaseLock();
            }
        }

        window.fetch = function(input, options) {
            let url;
            try { url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href); }
            catch { return originalFetch(input, options); }
            if (url.origin !== location.origin) return originalFetch(input, options);
            const uploading = /\/gradio_api\/upload\/?$/.test(url.pathname)
                && options && String(options.method).toUpperCase() === "POST" && options.body instanceof FormData;
            let batch = null;
            let queueRequest = null;
            let ownProgress = false;
            if (uploading) {
                const files = [...options.body.values()].filter(file => file && typeof file.name === "string" && Number.isFinite(file.size));
                if (files.length) {
                    const identifier = url.searchParams.get("upload_id") || `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    if (!url.searchParams.has("upload_id")) {
                        url.searchParams.set("upload_id", identifier);
                        input = url.toString();
                        ownProgress = true;
                    }
                    batch = tracker.begin(identifier, files);
                    transferStarted(files);
                    render();
                }
            } else if (/\/gradio_api\/queue\/join\/?$/.test(url.pathname) && options && typeof options.body === "string") {
                try {
                    const request = JSON.parse(options.body);
                    if (uploadFunction(request.fn_index) && request.data && Array.isArray(request.data[0])) {
                        queueRequest = tracker.join(request.data[0]);
                        render();
                    }
                } catch {}
            }
            const pendingResponse = originalFetch(input, options);
            if (batch && ownProgress) {
                const current = batch;
                const progressUrl = new URL(url);
                progressUrl.pathname = progressUrl.pathname.replace(/\/upload\/?$/, "/upload_progress");
                const signal = new AbortController();
                current.progressController = signal;
                void originalFetch(progressUrl.toString(), {
                    credentials: options.credentials, headers: options.headers, signal: signal.signal,
                }).then(response => {
                    if (!response.ok) return;
                    return observeStream(response, event => {
                        if (tracker.current(current) && event.msg === "update") {
                            current.receive(event.orig_name, event.chunk_size);
                            render();
                        }
                    });
                }).catch(() => {});
            }
            return pendingResponse.then(async response => {
                if (batch) {
                    const current = batch;
                    if (!response.ok) {
                        if (current.progressController) current.progressController.abort();
                        if (tracker.current(current)) current.fail(`上传失败（HTTP ${response.status}），请重试`);
                        render();
                    } else {
                        tracker.received(current);
                        try {
                            // Register the small path response before Gradio can
                            // consume it and enqueue its upload callback.
                            const paths = await response.clone().json();
                            if (tracker.current(current)) {
                                if (!tracker.accepted(current, paths)) {
                                    current.fail("服务器未确认全部附件，请重新选择文件");
                                }
                            }
                        } catch {
                            if (tracker.current(current)) current.fail("未能确认上传结果，请重试");
                        } finally {
                            if (current.progressController) current.progressController.abort();
                            render();
                        }
                    }
                }
                if (queueRequest) {
                    try {
                        const result = await response.clone().json();
                        if (response.ok && result.event_id) tracker.register(queueRequest, result.event_id);
                        else tracker.fail(queueRequest, "文件已传输，但未能加入待发送附件，请重试");
                    } catch {
                        tracker.fail(queueRequest, "文件已传输，但附件确认失败，请检查连接后重试");
                    }
                    render();
                }
                if (/\/gradio_api\/upload_progress\/?$/.test(url.pathname) && response.ok) {
                    const identifier = url.searchParams.get("upload_id");
                    let current = batches.get(identifier);
                    void observeStream(response.clone(), event => {
                        // Gradio may open progress SSE before its POST starts.
                        if (!current) current = batches.get(identifier);
                        if (current && tracker.current(current) && event.msg === "update") {
                            current.receive(event.orig_name, event.chunk_size);
                            render();
                        }
                    });
                } else if (/\/gradio_api\/queue\/data\/?$/.test(url.pathname) && response.ok) {
                    void observeStream(response.clone(), event => {
                        if (event.msg === "process_completed" && event.event_id) {
                            tracker.complete(event.event_id, event.success);
                            render();
                        }
                    });
                }
                return response;
            }, error => {
                if (batch) {
                    if (batch.progressController) batch.progressController.abort();
                    if (tracker.current(batch)) batch.fail("上传连接中断，请检查网络后重试");
                    render();
                }
                if (queueRequest) {
                    tracker.fail(queueRequest, "文件已传输，但附件确认连接中断，请重试");
                    render();
                }
                throw error;
            });
        };

        document.addEventListener("change", event => {
            if (!event.target.matches('input[type="file"]') || !event.target.closest("#pdf-upload") || !event.target.files.length) return;
            selected = [...event.target.files];
            pendingSelection = [...selected];
            selectionPending = true;
            const version = ++selectionVersion;
            clearTimeout(selectionTimer);
            selectionTimer = setTimeout(() => {
                if (!selectionPending || version !== selectionVersion) return;
                selectionPending = false;
                const item = new UploadBatch(`selection-${version}`, pendingSelection, tracker.epoch);
                item.fail("部分文件尚未开始上传，请重新选择或检查文件格式");
                batches.set(item.id, item);
                pendingSelection = [];
                render();
            }, 15000);
            render();
        }, true);
        document.addEventListener("click", event => {
            const target = event.target.closest("#send-button,#clear-upload,#new-chat");
            if (!target) return;
            if (target.id === "send-button" ? sendBlocked() : blocked()) {
                event.preventDefault();
                event.stopImmediatePropagation();
            } else resetFeedback();
        }, true);
        document.addEventListener("keydown", event => {
            if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229
                || !event.target.closest("#composer")) return;
            if (sendBlocked()) {
                event.preventDefault();
                event.stopImmediatePropagation();
            } else if (event.target.matches("textarea")) resetFeedback();
        }, true);

        new MutationObserver(settle).observe(document.documentElement, {
            childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"],
        });
        mount();
    }

    if (typeof module === "object" && module.exports) module.exports = { UploadBatch, UploadTracker, filePaths, parseEvents, install };
    else install();
})();
