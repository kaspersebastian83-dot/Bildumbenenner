// A complete, independently hashed synthetic update response for UI tests.
const crypto=require('node:crypto');
module.exports=function alternateHTML(html){
  const changed=html.replace('</body>','<!-- synthetic verified alternate update -->\n</body>');
  const pattern=/const APP_BUILD = 'sha256:[a-f0-9]{64}'/g;
  const normalized=changed.replace(pattern,"const APP_"+"BUILD = 'sha256:BUILD'");
  return changed.replace(pattern,"const APP_"+"BUILD = 'sha256:"+crypto.createHash('sha256').update(normalized).digest('hex')+"'");
};
