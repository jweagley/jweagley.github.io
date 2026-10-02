// Minimal .docx writer for the course schedule (WordprocessingML + JSZip).
// Written by hand rather than with a library so the deliverable cells can
// hold Word content controls ("click here to type" fill-in fields).
(function (root) {
  "use strict";

  var GOLD = "CFB991"; // Purdue Boilermaker Gold
  var PAGE_W = 12240, MARGIN = 1080; // Letter, 0.75" margins (twips)
  var TABLE_W = PAGE_W - 2 * MARGIN;
  var COL1 = 2300, COL2 = TABLE_W - COL1;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function run(text, o) {
    o = o || {};
    var pr = "";
    if (o.style) pr += '<w:rStyle w:val="' + o.style + '"/>';
    if (o.font) pr += '<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '" w:cs="' + o.font + '"/>';
    if (o.bold) pr += "<w:b/>";
    if (o.italic) pr += "<w:i/>";
    if (o.caps) pr += "<w:caps/>";
    if (o.color) pr += '<w:color w:val="' + o.color + '"/>';
    if (o.spacing) pr += '<w:spacing w:val="' + o.spacing + '"/>';
    if (o.size) pr += '<w:sz w:val="' + o.size * 2 + '"/><w:szCs w:val="' + o.size * 2 + '"/>';
    return "<w:r>" + (pr ? "<w:rPr>" + pr + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + esc(text) + "</w:t></w:r>";
  }

  function para(content, o) {
    o = o || {};
    var pr = "";
    if (o.style) pr += '<w:pStyle w:val="' + o.style + '"/>';
    if (o.keepNext) pr += "<w:keepNext/>";
    pr += '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after || 0) + '"/>';
    if (o.align) pr += '<w:jc w:val="' + o.align + '"/>';
    return "<w:p><w:pPr>" + pr + "</w:pPr>" + content + "</w:p>";
  }

  // Inline rich-text content control showing gray placeholder text.
  var sdtId = 1000;
  function field(alias, placeholder) {
    sdtId++;
    return (
      "<w:sdt><w:sdtPr>" +
      '<w:alias w:val="' + esc(alias) + '"/><w:tag w:val="' + esc(alias) + '"/>' +
      '<w:id w:val="' + sdtId + '"/><w:showingPlcHdr/>' +
      "</w:sdtPr><w:sdtContent>" + run(placeholder, { style: "PlaceholderText" }) + "</w:sdtContent></w:sdt>"
    );
  }

  function cell(width, content, o) {
    o = o || {};
    var pr = '<w:tcW w:w="' + width + '" w:type="dxa"/>';
    if (o.span) pr += '<w:gridSpan w:val="' + o.span + '"/>';
    if (o.fill) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>';
    pr += '<w:vAlign w:val="' + (o.vAlign || "top") + '"/>';
    return "<w:tc><w:tcPr>" + pr + "</w:tcPr>" + content + "</w:tc>";
  }

  function row(cells, o) {
    o = o || {};
    var pr = "<w:cantSplit/>";
    if (o.header) pr += "<w:tblHeader/>";
    if (o.height) pr += '<w:trHeight w:val="' + o.height + '"/>';
    return "<w:tr><w:trPr>" + pr + "</w:trPr>" + cells.join("") + "</w:tr>";
  }

  function weekRow(w, opts) {
    var left =
      para(run(w.label, { bold: true }), { align: "center" }) +
      para(run(w.range), { align: "center" }) +
      w.notes.map(function (n) {
        return para(run(n.text, { italic: true, size: 8.5, color: "8E6F3E" }), { align: "center", before: 40 });
      }).join("");

    var bullets = [];
    for (var i = 0; i < opts.bullets; i++) {
      var body = opts.fillable ? field(w.label + " deliverable " + (i + 1), "Click to add a deliverable") : "";
      bullets.push(para(body, { style: "TableBullet" }));
    }
    return row([cell(COL1, left), cell(COL2, bullets.join(""), { vAlign: "center" })], { height: 560 });
  }

  function breakRow(w) {
    return row(
      [cell(TABLE_W, para(run(w.label, { bold: true, color: "FFFFFF" }), { align: "center", before: 20, after: 20 }), { span: 2, fill: "000000", vAlign: "center" })]
    );
  }

  function logoXml(logo) {
    // EMU sizes must be integers or Word refuses to open the file.
    logo = { cx: Math.round(logo.cx), cy: Math.round(logo.cy), ext: logo.ext };
    return (
      '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + logo.cx + '" cy="' + logo.cy + '"/><wp:docPr id="1" name="Logo"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.' + logo.ext + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + logo.cx + '" cy="' + logo.cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      "</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
    );
  }

  function documentXml(m) {
    var head = m.logo
      ? para(logoXml(m.logo), { after: 60 })
      : para(run("Purdue", { bold: true, size: 24, font: "Georgia", caps: true }) + run("  University", { size: 11, caps: true, spacing: 30, color: "555960" }), { after: 60 });

    var body = head;
    body += para(run(m.title, { bold: true, italic: true, size: 18 }), { align: "center", after: 20 });
    if (m.subtitle) body += para(run(m.subtitle, { italic: true, size: 12 }), { align: "center", after: 120 });
    if (m.intro) body += para(run(m.intro), { after: 60 });

    var b = '<w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>' +
      '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>';
    var rows = [
      row([
        cell(COL1, para(run("Week/Date", { bold: true }), { align: "center" }), { fill: GOLD, vAlign: "center" }),
        cell(COL2, para(run("Weekly Deliverables", { bold: true }), { align: "center" }), { fill: GOLD, vAlign: "center" })
      ], { header: true, height: 520 })
    ];
    m.weeks.forEach(function (w) { rows.push(w.isBreak ? breakRow(w) : weekRow(w, m)); });

    body +=
      '<w:tbl><w:tblPr><w:tblW w:w="' + TABLE_W + '" w:type="dxa"/><w:tblBorders>' + b + "</w:tblBorders>" +
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="' + COL1 + '"/><w:gridCol w:w="' + COL2 + '"/></w:tblGrid>' +
      rows.join("") + "</w:tbl>";

    if (m.sourceNote) body += para(run(m.sourceNote, { italic: true, size: 8, color: "6F727B" }), { before: 120 });

    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
      "<w:body>" + body +
      '<w:sectPr><w:pgSz w:w="' + PAGE_W + '" w:h="15840"/><w:pgMar w:top="' + MARGIN + '" w:right="' + MARGIN + '" w:bottom="' + MARGIN + '" w:left="' + MARGIN + '" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      "</w:body></w:document>"
    );
  }

  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="TableBullet"><w:name w:val="Table Bullet"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
    '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="20" w:after="20"/><w:ind w:left="360" w:hanging="270"/></w:pPr></w:style>' +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
    '<w:style w:type="character" w:styleId="PlaceholderText"><w:name w:val="Placeholder Text"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:semiHidden/><w:rPr><w:color w:val="808080"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    "</w:styles>";

  var NUMBERING =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' +
    '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="270"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl>' +
    '<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="◦"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="270"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl>' +
    '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';

  var SETTINGS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';

  function build(m, JSZipImpl) {
    sdtId = 1000;
    var Z = JSZipImpl || root.JSZip;
    var zip = new Z();
    var imgType = m.logo ? (m.logo.ext === "png" ? "image/png" : "image/jpeg") : null;

    zip.file("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      (m.logo ? '<Default Extension="' + m.logo.ext + '" ContentType="' + imgType + '"/>' : "") +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      "</Types>");

    zip.file("_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      "</Relationships>");

    zip.file("word/_rels/document.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      (m.logo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.' + m.logo.ext + '"/>' : "") +
      "</Relationships>");

    var now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    zip.file("docProps/core.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + esc(m.title) + "</dc:title><dc:creator>Course Schedule Builder</dc:creator>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified>" +
      "</cp:coreProperties>");

    zip.file("word/document.xml", documentXml(m));
    zip.file("word/styles.xml", STYLES);
    zip.file("word/numbering.xml", NUMBERING);
    zip.file("word/settings.xml", SETTINGS);
    if (m.logo) zip.file("word/media/logo." + m.logo.ext, m.logo.data);
    return zip;
  }

  var api = { build: build, documentXml: documentXml };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ScheduleDocx = api;
})(this);
