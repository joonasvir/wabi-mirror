import express from 'express';
import { dirname } from 'path';
import { join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Static assets — icons, fonts, and the index page itself.
app.use('/icons', express.static(join(__dirname, '3d icons/images')));
app.use('/fonts', express.static(join(__dirname, 'fonts')));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3458;
app.listen(PORT, () => {
  console.log(`Wabi onboarding → http://localhost:${PORT}`);
});
