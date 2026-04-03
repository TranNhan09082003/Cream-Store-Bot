function escapeHtml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMessageHtml(message) {
  const authorName = escapeHtml(message.member?.displayName ?? message.author?.displayName ?? message.author?.username ?? 'Unknown');
  const authorTag = escapeHtml(message.author?.tag ?? 'Unknown');
  const avatarUrl = message.author?.displayAvatarURL?.({ extension: 'png', size: 128 }) ?? '';
  const content = escapeHtml(message.cleanContent || '[không có nội dung]').replace(/\n/g, '<br/>');
  const attachments = message.attachments.map((attachment) => {
    const safeUrl = escapeHtml(attachment.url);
    const safeName = escapeHtml(attachment.name ?? 'attachment');
    return `<li><a href="${safeUrl}">${safeName}</a></li>`;
  }).join('');

  return `
    <article class="message">
      <img class="avatar" src="${escapeHtml(avatarUrl)}" alt="avatar" />
      <div class="body">
        <div class="meta">
          <strong>${authorName}</strong>
          <span>${authorTag}</span>
          <time>${new Date(message.createdTimestamp).toLocaleString('vi-VN')}</time>
        </div>
        <div class="content">${content}</div>
        ${attachments ? `<ul class="attachments">${attachments}</ul>` : ''}
      </div>
    </article>
  `;
}

export async function exportTicketTranscript(channel) {
  let lastId;
  const allMessages = [];

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
    if (!batch.size) break;

    allMessages.push(...batch.values());
    lastId = batch.last().id;

    if (batch.size < 100) break;
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = allMessages.map((message) => {
    const attachments = message.attachments.map((attachment) => attachment.url).join(' | ');
    const contentParts = [message.cleanContent || '[không có nội dung]'];

    if (attachments) {
      contentParts.push(`Attachments: ${attachments}`);
    }

    return `[${new Date(message.createdTimestamp).toISOString()}] ${message.author?.tag ?? 'Unknown'} (${message.author?.id ?? 'N/A'}): ${contentParts.join(' | ')}`;
  });

  const transcriptText = lines.join('\n');
  const messagesHtml = allMessages.map(renderMessageHtml).join('\n');
  const transcriptHtml = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Transcript ${escapeHtml(channel.name)}</title>
<style>
:root { color-scheme: dark; }
body { font-family: Inter, system-ui, sans-serif; background:#11131a; color:#eef1f6; margin:0; padding:24px; }
header { margin-bottom:24px; }
h1 { margin:0 0 8px; font-size:28px; }
p.meta { margin:0; color:#9aa3b2; }
.message { display:flex; gap:14px; padding:14px 0; border-bottom:1px solid rgba(255,255,255,0.08); }
.avatar { width:42px; height:42px; border-radius:999px; object-fit:cover; background:#2b2f3a; }
.body { flex:1; min-width:0; }
.meta { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:6px; }
.meta strong { font-size:15px; }
.meta span, .meta time { color:#9aa3b2; font-size:13px; }
.content { white-space:pre-wrap; line-height:1.6; word-break:break-word; }
.attachments { margin:8px 0 0 18px; color:#8ab4ff; }
a { color:#8ab4ff; text-decoration:none; }
a:hover { text-decoration:underline; }
</style>
</head>
<body>
<header>
  <h1>Transcript ticket #${escapeHtml(channel.name)}</h1>
  <p class="meta">Tổng tin nhắn: ${allMessages.length}</p>
</header>
<section>${messagesHtml}</section>
</body>
</html>`;

  return {
    htmlBuffer: Buffer.from(transcriptHtml, 'utf8'),
    textBuffer: Buffer.from(transcriptText, 'utf8'),
    htmlFileName: `transcript_${channel.name}_${Date.now()}.html`,
    textFileName: `${channel.name}-transcript.txt`,
    messageCount: allMessages.length,
  };
}
