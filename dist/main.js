"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors({ origin: '*' });
    const port = Number(process.env.PORT || 3001);
    await app.listen(port, '0.0.0.0');
    console.log(`nest socket server listening on http://127.0.0.1:${port}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map