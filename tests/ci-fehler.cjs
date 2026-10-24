// Nur in GitHub Actions: Bricht ein Test ab, steht die letzte Fehlermeldung als Hinweis direkt am Lauf
// (die Rohlogs sind nicht überall abrufbar). Wird per NODE_OPTIONS=--require geladen; ändert nichts am Testablauf.
if (process.env.GITHUB_ACTIONS && /[\\/]tests[\\/][^\\/]+\.cjs$/.test(process.argv[1] || '')) {
  let puffer = '';
  // Alles, was auf stderr landet (console.error, unbehandelte Ausnahmen), die letzten 4000 Zeichen
  const schreiben = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => { try { puffer = (puffer + String(chunk)).slice(-4000); } catch {} return schreiben(chunk, ...rest); };
  process.on('exit', code => {
    if (!code && !process.exitCode) return;
    const name = require('node:path').basename(process.argv[1]), text = puffer.trim().slice(-1800) || `Exit-Code ${code || process.exitCode}`;
    process.stdout.write(`::error title=${name}::${text.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A')}\n`);
  });
}
