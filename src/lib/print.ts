import * as Print from 'expo-print';
import { Platform } from 'react-native';

/** Ouvre le document HTML pour impression / « Enregistrer en PDF ». */
export async function printHtml(html: string) {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      return;
    }
    // bloqueur de pop-up : iframe cachée
    const f = document.createElement('iframe');
    f.style.position = 'fixed';
    f.style.width = '0';
    f.style.height = '0';
    document.body.appendChild(f);
    f.contentDocument?.open();
    f.contentDocument?.write(html.replace(/<script>[\s\S]*?<\/script>/, ''));
    f.contentDocument?.close();
    setTimeout(() => {
      f.contentWindow?.print();
      setTimeout(() => f.remove(), 2000);
    }, 400);
    return;
  }
  await Print.printAsync({ html: html.replace(/<script>[\s\S]*?<\/script>/, '') });
}
