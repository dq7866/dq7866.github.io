/* pdf-office-wasm.js · 高保真 PDF→Office 拦截器
 * 后端 LibreOffice 不可用时，用纯 JS 实现高保真转换：
 * 将每页 PDF 渲染为高分辨率图片，嵌入 docx，保留视觉布局。
 */
(function () {
    "use strict";
    if (window.__pdfOfficeInterceptorInstalled) return;
    window.__pdfOfficeInterceptorInstalled = true;

    const SERVICE = "http://127.0.0.1:8765";

    function matches(url, suffix) {
        return url.indexOf(SERVICE + suffix) >= 0 || url.indexOf(suffix) >= 0;
    }

    async function handleConvert(url, opts) {
        const u = new URL(url, location.href);
        const to = (u.searchParams.get("to") || "docx").toLowerCase();
        try {
            const pdfBlob = opts.body;
            const pdfData = await pdfBlob.arrayBuffer();
            // 用 pdf.js 加载 PDF
            const pdfjsLib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
            if (!pdfjsLib) throw new Error("pdf.js 未加载");
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            const pdf = await loadingTask.promise;
            const scale = 2.0; // 高分辨率
            const images = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");
                await page.render({ canvasContext: ctx, viewport }).promise;
                const imgBlob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
                images.push(imgBlob);
            }
            if (to === "docx") {
                const docxBlob = await imagesToDocx(images);
                return new Response(docxBlob, {
                    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
                });
            } else if (to === "pptx") {
                const pptxBlob = await imagesToPptx(images);
                return new Response(pptxBlob, {
                    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
                });
            }
            return new Response("不支持的格式", { status: 400 });
        } catch (e) {
            return new Response("转换失败：" + e.message, { status: 500 });
        }
    }

    async function imagesToDocx(images) {
        const body = [];
        for (let i = 0; i < images.length; i++) {
            const imgBuf = await images[i].arrayBuffer();
            const b64 = arrayBufferToBase64(imgBuf);
            const w = 595, h = 842; // A4 in points
            body.push(
                '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
                '<wp:extent cx="' + Math.round(w * 914400 / 72) + '" cy="' + Math.round(h * 914400 / 72) + '"/>' +
                '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
                '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                '<pic:nvPicPr><pic:cNvPr id="' + (i+1) + '" name="page' + (i+1) + '.jpg"/>' +
                '<pic:cNvPicPr/></pic:nvPicPr><pic:blipFill>' +
                '<a:blip r:embed="rId' + (i+1) + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>' +
                '<a:stretch/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/>' +
                '<a:ext cx="' + Math.round(w * 914400 / 72) + '" cy="' + Math.round(h * 914400 / 72) + '"/></a:xfrm>' +
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
                '</wp:inline></w:r></w:p>'
            );
            if (i < images.length - 1) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        }
        const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
            'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
            'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
            'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            '<w:body>' + body.join("") + '<w:sectPr/></w:body></w:document>';
        const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Default Extension="jpg" ContentType="image/jpeg"/>' +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
            '</Types>';
        let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        for (let i = 0; i < images.length; i++) {
            rels += '<Relationship Id="rId' + (i+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page' + (i+1) + '.jpg"/>';
        }
        rels += '<Relationship Id="rId0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
        let docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        for (let i = 0; i < images.length; i++) {
            docRels += '<Relationship Id="rId' + (i+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page' + (i+1) + '.jpg"/>';
        }
        docRels += '</Relationships>';
        const zip = new JSZip();
        zip.file("[Content_Types].xml", ct);
        zip.folder("_rels").file(".rels", rels);
        zip.folder("word").file("document.xml", doc);
        zip.folder("word/_rels").file("document.xml.rels", docRels);
        for (let i = 0; i < images.length; i++) {
            const imgBuf = await images[i].arrayBuffer();
            zip.folder("word/media").file("page" + (i+1) + ".jpg", imgBuf);
        }
        return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    }

    async function imagesToPptx(images) {
        const slides = [];
        for (let i = 0; i < images.length; i++) {
            const imgBuf = await images[i].arrayBuffer();
            const slideXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
                '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
                'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
                '<p:cSld><p:spTree><p:pic><p:cNvPr id="1" name="page' + (i+1) + '"/><p:cNvPicPr/>' +
                '<p:blipFill><a:blip r:embed="rId1"/><a:stretch/></p:blipFill>' +
                '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="6858000"/></a:xfrm>' +
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld></p:sld>';
            const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/page' + (i+1) + '.jpg"/>' +
                '</Relationships>';
            slides.push({ xml: slideXml, rels: relsXml, img: imgBuf });
        }
        const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Default Extension="jpg" ContentType="image/jpeg"/>' +
            '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
            slides.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i+1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join("") +
            '</Types>';
        const presRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            slides.map((_, i) => '<Relationship Id="rId' + (i+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i+1) + '.xml"/>').join("") +
            '</Relationships>';
        const presXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
            'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            slides.map((_, i) => '<p:sldIdLst><p:sldId id="' + (i+1) + '" r:id="rId' + (i+1) + '"/></p:sldIdLst>').join("") +
            '<p:sldIdLst>' + slides.map((_, i) => '<p:sldId id="' + (i+1) + '" r:id="rId' + (i+1) + '"/>').join("") + '</p:sldIdLst>' +
            '</p:presentation>';
        const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
            '</Relationships>';
        const zip = new JSZip();
        zip.file("[Content_Types].xml", ct);
        zip.folder("_rels").file(".rels", rootRels);
        zip.folder("ppt").file("presentation.xml", presXml);
        zip.folder("ppt/_rels").file("presentation.xml.rels", presRels);
        for (let i = 0; i < slides.length; i++) {
            zip.folder("ppt/slides").file("slide" + (i+1) + ".xml", slides[i].xml);
            zip.folder("ppt/slides/_rels").file("slide" + (i+1) + ".xml.rels", slides[i].rels);
            zip.folder("ppt/media").file("page" + (i+1) + ".jpg", slides[i].img);
        }
        return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    }

    function arrayBufferToBase64(buf) {
        let binary = "";
        const bytes = new Uint8Array(buf);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    const origFetch = window.fetch.bind(window);
    window.fetch = async function (url, opts) {
        const urlStr = typeof url === "string" ? url : (url && url.url) || "";
        if (matches(urlStr, "/convert") && opts && opts.method === "POST") {
            // 先尝试后端
            try {
                const res = await origFetch(url, Object.assign({}, opts, { signal: AbortSignal.timeout(3000) }));
                if (res.ok) return res;
            } catch (e) {}
            // 后端不可用，用 WASM/纯 JS
            return handleConvert(urlStr, opts);
        }
        return origFetch(url, opts);
    };

    console.log("[pdf-office-interceptor] 已安装");
})();
