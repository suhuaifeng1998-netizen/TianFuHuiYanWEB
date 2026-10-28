(() => {
    "use strict";

    class UploadBatch {
        constructor(identifier, files) {
            this.id = identifier;
            this.files = files.map(file => ({ name: file.name, size: file.size }));
            this.total = this.files.reduce((sum, file) => sum + file.size, 0);
            this.received = new Map();
            this.observed = false;
            this.state = "uploading";
            this.error = "";
            this.digest = null;
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
            return [...this.received.values()].reduce((sum, count) => sum + count, 0);
        }
        get percent() {
            if (this.state === "adding" || this.state === "ready") return 100;
            return this.observed && this.total ? Math.floor(100 * this.loaded / this.total) : null;
        }
        get completed() {
            if (this.state === "adding" || this.state === "ready") return this.files.length;
            const required = new Map();
            return this.files.reduce((sum, file) => {
                const threshold = (required.get(file.name) || 0) + file.size;
                required.set(file.name, threshold);
                return sum + (file.size > 0 && (this.received.get(file.name) || 0) >= threshold ? 1 : 0);
            }, 0);
        }
        accepted() {
            if (this.state !== "uploading") return;
            this.state = "adding";
            this.observed = true;
            this.received.clear();
            this.files.forEach(file => this.received.set(file.name,
                (this.received.get(file.name) || 0) + file.size));
        }
        ready() {
            if (this.state === "adding") this.state = "ready";
        }
        fail(message) {
            if (this.state !== "ready") {
                this.state = "failed";
                this.error = message;
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
        const batches = new Map();
        const readyDigests = new Set();
        const queueEvents = new Map();
        const completedQueueEvents = new Map();
        let selected = null;
        let selectionPending = false;
        let selectionTimer;
        let stopWasRevealing = false;
        const active = batch => batch.state === "uploading" || batch.state === "adding";
        const blocked = () => selectionPending || [...batches.values()].some(active);

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
            document.querySelectorAll("#send-button,#clear-upload,#new-chat").forEach(control => {
                if (blocked()) control.setAttribute("aria-disabled", "true");
                else control.removeAttribute("aria-disabled");
            });
            if (!element) return;
            element.hidden = !list.length && !selectionPending;
            const failed = list.filter(batch => batch.state === "failed");
            const adding = list.some(batch => batch.state === "adding");
            const transferring = list.some(batch => batch.state === "uploading");
            const total = list.reduce((sum, batch) => sum + batch.total, 0);
            const loaded = list.reduce((sum, batch) => sum + Math.min(batch.total, batch.loaded), 0);
            const files = list.reduce((sum, batch) => sum + batch.files.length, 0);
            const completed = list.reduce((sum, batch) => sum + batch.completed, 0);
            const allObserved = list.length > 0 && list.every(batch => batch.observed);
            const allAccepted = list.length > 0 && list.every(batch => batch.state === "adding" || batch.state === "ready");
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
            let changed = false;
            document.querySelectorAll('[class*="matagent-upload-ready-"]').forEach(element => {
                element.classList.forEach(name => {
                    if (/^matagent-upload-ready-[a-f0-9]{64}$/.test(name)) readyDigests.add(name.slice(22));
                });
            });
            while (readyDigests.size > 128) readyDigests.delete(readyDigests.values().next().value);
            batches.forEach(batch => {
                if (batch.state === "adding" && batch.digest && readyDigests.has(batch.digest)) {
                    batch.ready();
                    changed = true;
                }
            });
            const attachments = document.querySelector(".attachment-status");
            if (batches.size && [...batches.values()].every(batch => batch.state === "ready")
                && !selectionPending && attachments && attachments.textContent.includes("暂无待发送附件")) {
                batches.clear();
                changed = true;
            }
            if (changed) render();
            syncStop();
        }

        async function pathDigest(paths) {
            if (!window.crypto || !window.crypto.subtle) return null;
            const buffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(paths)));
            return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, "0")).join("");
        }

        function uploadFunction(index) {
            const config = window.gradio_config;
            if (!config) return false;
            const ids = new Set(config.components.filter(component => component.props.elem_id === "pdf-upload")
                .map(component => component.id));
            return config.dependencies.some(dependency => dependency.id === index
                && dependency.targets.some(target => ids.has(target[0]) && target[1] === "upload"));
        }

        function completeQueueEvent(identifier, success) {
            if (!queueEvents.has(identifier)) {
                completedQueueEvents.set(identifier, success);
                while (completedQueueEvents.size > 64) completedQueueEvents.delete(completedQueueEvents.keys().next().value);
                return;
            }
            const digest = queueEvents.get(identifier);
            queueEvents.delete(identifier);
            completedQueueEvents.delete(identifier);
            if (success === false) {
                batches.forEach(item => { if (item.digest === digest) item.fail("附件未能加入待发送列表，请重试"); });
                render();
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
            let queueDigest = null;
            let ownProgress = false;
            if (uploading) {
                const files = [...options.body.values()].filter(file => file && typeof file.name === "string" && Number.isFinite(file.size));
                if (files.length) {
                    if (![...batches.values()].some(active)) batches.clear();
                    const identifier = url.searchParams.get("upload_id") || `batch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                    if (!url.searchParams.has("upload_id")) {
                        url.searchParams.set("upload_id", identifier);
                        input = url.toString();
                        ownProgress = true;
                    }
                    batch = new UploadBatch(identifier, files);
                    batches.set(identifier, batch);
                    selectionPending = false;
                    clearTimeout(selectionTimer);
                    render();
                }
            } else if (/\/gradio_api\/queue\/join\/?$/.test(url.pathname) && options && typeof options.body === "string") {
                try {
                    const request = JSON.parse(options.body);
                    if (uploadFunction(request.fn_index) && request.data && Array.isArray(request.data[0])) {
                        queueDigest = pathDigest(request.data[0].map(file => typeof file === "string" ? file : file.path));
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
                        if (event.msg === "update") {
                            current.receive(event.orig_name, event.chunk_size);
                            render();
                        }
                    });
                }).catch(() => {});
            }
            return pendingResponse.then(response => {
                if (batch) {
                    const current = batch;
                    if (!response.ok) {
                        if (current.progressController) current.progressController.abort();
                        current.fail(`上传失败（HTTP ${response.status}），请重试`);
                        render();
                    } else {
                        response.clone().json().then(async paths => {
                            if (!Array.isArray(paths) || paths.length !== current.files.length) {
                                current.fail("服务器未确认全部附件，请重新选择文件");
                            } else {
                                current.digest = await pathDigest(paths);
                                if (current.digest) current.accepted();
                                else current.fail("浏览器无法安全确认附件，请通过本地映射或 HTTPS 访问");
                            }
                            render();
                            settle();
                            if (current.progressController) current.progressController.abort();
                        }).catch(() => {
                            if (current.progressController) current.progressController.abort();
                            current.fail("未能确认上传结果，请重试"); render();
                        });
                    }
                }
                if (queueDigest) {
                    const expected = queueDigest;
                    response.clone().json().then(async result => {
                        const digest = await expected;
                        if (!digest) return;
                        if (response.ok && result.event_id) {
                            queueEvents.set(result.event_id, digest);
                            if (completedQueueEvents.has(result.event_id)) {
                                completeQueueEvent(result.event_id, completedQueueEvents.get(result.event_id));
                            }
                        }
                        else {
                            batches.forEach(item => { if (item.digest === digest) item.fail("附件未能加入待发送列表，请重试"); });
                            render();
                        }
                    }).catch(async () => {
                        const digest = await expected;
                        batches.forEach(item => { if (digest && item.digest === digest) item.fail("附件确认失败，请检查连接后重试"); });
                        render();
                    });
                }
                if (/\/gradio_api\/upload_progress\/?$/.test(url.pathname) && response.ok) {
                    const identifier = url.searchParams.get("upload_id");
                    void observeStream(response.clone(), event => {
                        const item = batches.get(identifier);
                        if (item && event.msg === "update") {
                            item.receive(event.orig_name, event.chunk_size);
                            render();
                        }
                    });
                } else if (/\/gradio_api\/queue\/data\/?$/.test(url.pathname) && response.ok) {
                    void observeStream(response.clone(), event => {
                        if (event.msg === "process_completed" && event.event_id) completeQueueEvent(event.event_id, event.success);
                    });
                }
                return response;
            }, error => {
                if (batch) {
                    if (batch.progressController) batch.progressController.abort();
                    batch.fail("上传连接中断，请检查网络后重试"); render();
                }
                if (queueDigest) queueDigest.then(digest => {
                    batches.forEach(item => { if (item.digest === digest) item.fail("附件确认连接中断，请重试"); });
                    render();
                });
                throw error;
            });
        };

        document.addEventListener("change", event => {
            if (!event.target.matches('input[type="file"]') || !event.target.closest("#pdf-upload") || !event.target.files.length) return;
            selected = [...event.target.files];
            selectionPending = true;
            clearTimeout(selectionTimer);
            selectionTimer = setTimeout(() => {
                if (!selectionPending) return;
                selectionPending = false;
                const item = new UploadBatch(`selection-${Date.now()}`, selected);
                item.fail("文件尚未开始上传，请重新选择或检查文件格式");
                batches.set(item.id, item);
                render();
            }, 15000);
            render();
        }, true);
        document.addEventListener("click", event => {
            const target = event.target.closest("#send-button,#clear-upload,#new-chat");
            if (!target) return;
            if (blocked()) {
                event.preventDefault();
                event.stopImmediatePropagation();
            } else if (target.id !== "send-button") {
                batches.clear();
                selected = null;
                render();
            }
        }, true);
        document.addEventListener("keydown", event => {
            if (blocked() && event.key === "Enter" && !event.shiftKey && !event.isComposing
                && event.keyCode !== 229 && event.target.closest("#composer")) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
        new MutationObserver(settle).observe(document.documentElement, {
            childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"],
        });
        mount();
    }

    if (typeof module === "object" && module.exports) module.exports = { UploadBatch, parseEvents };
    else install();
})();
