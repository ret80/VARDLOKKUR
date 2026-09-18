Изучив репозиторий и историю коммитов, я нашел причину регрессии с «черным экраном» и еще одну связанную проблему с конвейером рендеринга.

### 🔍 Причина черного экрана: Два перекрывающихся холста (Canvas)

В процессе миграции на абстракцию `IRenderer` в коде возникла ситуация, когда создаются **два независимых экземпляра `Application` (PixiJS)**, и их холсты накладываются друг на друга.

1. В **`src/game/engine/engine.ts`** создается собственный `app`, и его холст добавляется в DOM-контейнер **в самом конце**:
   ```typescript
   const app = new Application();
   await app.init({ background: 0x05080d, ... }); // Почти черный фон
   ...
   const cv = app.canvas as HTMLCanvasElement;
   cv.style.position = "absolute";
   cv.style.inset = "0";
   container.appendChild(cv); // Добавляется последним, перекрывая всё под собой!
   ```

2. В **`src/game/renderer/PixiJSRenderer.ts`** метод `init` **также** создает свой собственный `new Application()` и добавляет его в контейнер:
   ```typescript
   async init(container: HTMLElement, width: number, height: number): Promise<void> {
       this.app = new Application();
       await this.app.init({ ... });
       container.appendChild(this.app.canvas); // Добавляется первым
   ```

**Результат:** Холст из `engine.ts` оказывается поверх холста `PixiJSRenderer`. Поскольку на сцену `engine.ts` не добавляется игровая графика (вся она уходит в `worldContainer` рендерера), а фон у него `0x05080d` (черный), вы видите сплошной черный экран, который полностью скрывает отрисованную игру. UI (React) отрисовывается корректно, так как находится поверх всех `<canvas>` элементов.

---

### 🛠 Как исправить

Необходимо передавать уже созданный экземпляр `Application` из `engine.ts` в `PixiJSRenderer`, чтобы они работали с одной сценой и одним холстом.

#### 1. `src/game/renderer/IRenderer.ts`
Добавьте опциональный параметр `existingApp` в сигнатуру `init`:
```typescript
<<<<
    /** Инициализация рендерера. container — DOM-элемент для canvas. \*/
    init(container: HTMLElement, width: number, height: number): Promise<void>;
====
    /** Инициализация рендерера. container — DOM-элемент для canvas. \*/
    init(container: HTMLElement, width: number, height: number, existingApp?: any): Promise<void>;
>>>>
```

#### 2. `src/game/renderer/PixiJSRenderer.ts`
Обновите метод `init` так, чтобы он использовал переданный `existingApp`, если он есть, и не создавал дублирующий холст:
```typescript
<<<<
    async init(container: HTMLElement, width: number, height: number): Promise<void> {
        this.app = new Application();
        await this.app.init({
            background: 0x05080d,
            antialias: false,
            resolution: 1,
            width,
            height,
        });
        container.appendChild(this.app.canvas);

        // Корневой контейнер мира (сдвигается камерой)
====
    async init(container: HTMLElement, width: number, height: number, existingApp?: any): Promise<void> {
        if (existingApp) {
            this.app = existingApp;
        } else {
            this.app = new Application();
            await this.app.init({
                background: 0x05080d,
                antialias: false,
                resolution: 1,
                width,
                height,
            });
            container.appendChild(this.app.canvas);
        }

        // Корневой контейнер мира (сдвигается камерой)
>>>>
```

#### 3. `src/game/engine/engine.ts`
Передайте созданный `app` в рендерер при инициализации:
```typescript
<<<<
        const renderer = RendererFactory.create('pixi');
        await renderer.init(container, this.viewport.viewW, this.viewport.viewH);
        setGlobalRenderer(renderer);
====
        const renderer = RendererFactory.create('pixi');
        await renderer.init(container, this.viewport.viewW, this.viewport.viewH, app); // <--- Передали app
        setGlobalRenderer(renderer);
>>>>
```

---

### 🐛 Дополнительная проблема: Задержка рендеринга на 1 кадр

В файле `src/game/engine/render-pipeline.ts` есть комментарий: *"После render() всех слоёв вызывается renderer.render() для финального вывода"*. Но по факту `RenderPipeline` не вызывает `renderer.render()`. 

Вместо этого `RenderSystem` (который является самым первым `EntityLayer` в пайплайне) вызывает `r.render()` в самом конце своего метода `render()`. Из-за этого холст рендерится **до** того, как отработают `FogLayer`, `ParticleLayer` и `OverlayLayer`. Туман, частицы и оверлеи (включая `fadeG`) появляются только на следующем кадре.

#### Как исправить пайплайн:

**1. `src/game/engine/render-pipeline.ts`**
Сохраняйте `renderer` и вызывайте финальный рендер после прохода всех слоев:
```typescript
<<<<
export class RenderPipeline {
    private layers: IRenderLayer[] = [];
    private initialized = false;

    /** Добавить слой в пайплайн. Слои вызываются в порядке добавления. \*/
    addLayer(layer: IRenderLayer): void {
        this.layers.push(layer);
    }

    /** Инициализировать все слои. Вызывается один раз при создании пайплайна. \*/
    init(renderer: IRenderer, ctx: RenderLayerContext): void {
        for (const layer of this.layers) {
            layer.init(renderer, ctx);
        }
        this.initialized = true;
    }
====
export class RenderPipeline {
    private layers: IRenderLayer[] = [];
    private initialized = false;
    private renderer: IRenderer | null = null; // <--- Добавили

    /** Добавить слой в пайплайн. Слои вызываются в порядке добавления. \*/
    addLayer(layer: IRenderLayer): void {
        this.layers.push(layer);
    }

    /** Инициализировать все слои. Вызывается один раз при создании пайплайна. \*/
    init(renderer: IRenderer, ctx: RenderLayerContext): void {
        this.renderer = renderer; // <--- Сохраняем
        for (const layer of this.layers) {
            layer.init(renderer, ctx);
        }
        this.initialized = true;
    }
>>>>
```

И обновите метод `render()`:
```typescript
<<<<
    /** Отрисовать все слои и выполнить финальный рендер. Вызывается каждый кадр. \*/
    render(ctx: RenderLayerContext): void {
        if (!this.initialized) return;
        for (const layer of this.layers) {
            layer.render(ctx);
        }
    }
====
    /** Отрисовать все слои и выполнить финальный рендер. Вызывается каждый кадр. \*/
    render(ctx: RenderLayerContext): void {
        if (!this.initialized) return;
        for (const layer of this.layers) {
            layer.render(ctx);
        }
        // Финальный рендер через IRenderer (вызывается после всех слоёв)
        this.renderer?.render(); // <--- Добавили
    }
>>>>
```

**2. `src/game/ecs/ecs-systems/render-system.ts`**
Удалите дублирующий вызов `r.render()` из конца метода `render()`:
```typescript
<<<<
        // === Финальный рендер через IRenderer (Этап 6) ===
        r.render();
    }
====
    }
>>>>
```

После применения этих правок холст станет единственным, графика корректно отобразится, а туман и эффекты будут отрисовываться в том же кадре, что и сущности.