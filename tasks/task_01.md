Есть проблемы:
1 дома все еще рисуются как отделно стоящие домики размером 1x1. У домов нет цельной крыши, А какие то горбы. Я уже 3 раз прошу тебя исправить данную проблему. Но все бестолку!
2 Генерация поселения:
У нас генератор поселения получает площадку размером NxM. На этой площадки он выбирает случайным образом место под ворота. Ворота должны прилегать к краю площадки. Место под ворота не должно находится по углом. Сама площадка под ворота занимает 2x2 тайла. Дальше вокруг деревни располагается забор исключая площадку под ворота. Потом на оставшейся незанятой площади случайно расставляем дома (дома должны занимать от 30% до 40% свободной площади деревни). Таким образом что бы они не соприкасались друг с другом (зазор в 1 таил). Теперь от домов к воротам проводим дорогу. После этого расставляем возле дороги жителей. Все жители деревни должны размещаться в ней. 

вот примерный код алгоритма для генерации деревни:

// ============ Типы и интерфейсы ============

interface IPosition {
    readonly x: number;
    readonly y: number;
}

interface ISize {
    readonly width: number;
    readonly height: number;
}

interface IRectangle extends IPosition, ISize {}

interface IHouse extends IRectangle {}

interface IGate extends IRectangle {}

interface IVillage {
    readonly width: number;
    readonly height: number;
    readonly gate: IGate;
    readonly fence: readonly IPosition[];
    readonly houses: readonly IHouse[];
    readonly roads: readonly IPosition[];
    readonly residents: readonly IPosition[];
}

// ============ Конфигурация ============

interface IVillageGeneratorConfig {
    readonly minVillageSize: number;
    readonly gateSize: number;
    readonly houseSizes: readonly ISize[];
    readonly houseGap: number;
    readonly minOccupancyRate: number;
    readonly maxOccupancyRate: number;
    readonly maxPlacementAttempts: number;
}

class VillageGeneratorConfig implements IVillageGeneratorConfig {
    public readonly minVillageSize = 6;
    public readonly gateSize = 2;
    public readonly houseSizes: readonly ISize[] = [
        { width: 2, height: 2 },
        { width: 2, height: 3 },
        { width: 3, height: 2 },
        { width: 3, height: 3 }
    ];
    public readonly houseGap = 1;
    public readonly minOccupancyRate = 0.30;
    public readonly maxOccupancyRate = 0.40;
    public readonly maxPlacementAttempts = 1000;
}

// ============ Стороны света ============

enum Direction {
    North = 'NORTH',
    East = 'EAST',
    South = 'SOUTH',
    West = 'WEST'
}

// ============ Интерфейсы для сервисов ============

interface IGrid {
    readonly width: number;
    readonly height: number;
    isOccupied(position: IPosition): boolean;
    occupy(position: IPosition): void;
    occupyArea(rectangle: IRectangle): void;
    isAreaFree(rectangle: IRectangle, margin?: number): boolean;
    getFreeArea(): number;
    getOccupiedArea(): number;
}

interface IRandomService {
    nextInt(min: number, max: number): number;
    nextFloat(min: number, max: number): number;
    pickRandom<T>(items: readonly T[]): T;
}

interface IPathFinder {
    findPath(from: IPosition, to: IPosition): IPosition[];
}

interface IVillageValidator {
    validate(village: IVillage): boolean;
}

// ============ Реализация Grid ============

class Grid implements IGrid {
    private readonly cells: boolean[][];

    constructor(
        public readonly width: number,
        public readonly height: number
    ) {
        this.cells = Array.from({ length: height }, () => 
            Array(width).fill(false)
        );
    }

    public isOccupied(position: IPosition): boolean {
        this.validatePosition(position);
        return this.cells[position.y][position.x];
    }

    public occupy(position: IPosition): void {
        this.validatePosition(position);
        this.cells[position.y][position.x] = true;
    }

    public occupyArea(rectangle: IRectangle): void {
        this.validateRectangle(rectangle);
        for (let y = rectangle.y; y < rectangle.y + rectangle.height; y++) {
            for (let x = rectangle.x; x < rectangle.x + rectangle.width; x++) {
                this.cells[y][x] = true;
            }
        }
    }

    public isAreaFree(rectangle: IRectangle, margin: number = 0): boolean {
        const checkRect = this.expandRectangle(rectangle, margin);
        
        if (!this.isRectangleWithinBounds(checkRect)) {
            return false;
        }

        for (let y = checkRect.y; y < checkRect.y + checkRect.height; y++) {
            for (let x = checkRect.x; x < checkRect.x + checkRect.width; x++) {
                if (this.cells[y][x]) {
                    return false;
                }
            }
        }
        return true;
    }

    public getFreeArea(): number {
        return this.width * this.height - this.getOccupiedArea();
    }

    public getOccupiedArea(): number {
        let occupied = 0;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.cells[y][x]) occupied++;
            }
        }
        return occupied;
    }

    private validatePosition(position: IPosition): void {
        if (position.x < 0 || position.x >= this.width || 
            position.y < 0 || position.y >= this.height) {
            throw new Error(`Position (${position.x}, ${position.y}) is out of bounds`);
        }
    }

    private validateRectangle(rectangle: IRectangle): void {
        if (rectangle.x < 0 || rectangle.y < 0 ||
            rectangle.x + rectangle.width > this.width ||
            rectangle.y + rectangle.height > this.height) {
            throw new Error(`Rectangle ${JSON.stringify(rectangle)} is out of bounds`);
        }
    }

    private isRectangleWithinBounds(rectangle: IRectangle): boolean {
        return rectangle.x >= 0 && rectangle.y >= 0 &&
               rectangle.x + rectangle.width <= this.width &&
               rectangle.y + rectangle.height <= this.height;
    }

    private expandRectangle(rectangle: IRectangle, margin: number): IRectangle {
        return {
            x: Math.max(0, rectangle.x - margin),
            y: Math.max(0, rectangle.y - margin),
            width: Math.min(this.width - Math.max(0, rectangle.x - margin), 
                           rectangle.width + 2 * margin),
            height: Math.min(this.height - Math.max(0, rectangle.y - margin), 
                            rectangle.height + 2 * margin)
        };
    }
}

// ============ Реализация RandomService ============

class RandomService implements IRandomService {
    public nextInt(min: number, max: number): number {
        return Math.floor(this.nextFloat(min, max + 1));
    }

    public nextFloat(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    public pickRandom<T>(items: readonly T[]): T {
        if (items.length === 0) {
            throw new Error('Cannot pick from empty array');
        }
        return items[this.nextInt(0, items.length - 1)];
    }
}

// ============ Реализация PathFinder ============

class PathFinder implements IPathFinder {
    public findPath(from: IPosition, to: IPosition): IPosition[] {
        const path: IPosition[] = [];
        
        // Строим L-образный путь: сначала по вертикали, затем по горизонтали
        const stepY = from.y < to.y ? 1 : -1;
        for (let y = from.y; y !== to.y + stepY; y += stepY) {
            path.push({ x: from.x, y });
        }

        const stepX = from.x < to.x ? 1 : -1;
        for (let x = from.x + stepX; x !== to.x + stepX; x += stepX) {
            path.push({ x, y: to.y });
        }

        return path;
    }
}

// ============ Реализация Validator ============

class VillageValidator implements IVillageValidator {
    public validate(village: IVillage): boolean {
        if (village.width < 0 || village.height < 0) return false;
        if (!this.isGateValid(village)) return false;
        if (!this.areHousesValid(village)) return false;
        if (!this.isFenceValid(village)) return false;
        return true;
    }

    private isGateValid(village: IVillage): boolean {
        const { gate, width, height } = village;
        return gate.x >= 0 && gate.y >= 0 &&
               gate.x + gate.width <= width &&
               gate.y + gate.height <= height &&
               this.isGateOnEdge(gate, width, height) &&
               !this.isGateInCorner(gate, width, height);
    }

    private isGateOnEdge(gate: IRectangle, width: number, height: number): boolean {
        return gate.x === 0 || gate.x + gate.width === width ||
               gate.y === 0 || gate.y + gate.height === height;
    }

    private isGateInCorner(gate: IRectangle, width: number, height: number): boolean {
        return (gate.x === 0 && gate.y === 0) ||
               (gate.x + gate.width === width && gate.y === 0) ||
               (gate.x === 0 && gate.y + gate.height === height) ||
               (gate.x + gate.width === width && gate.y + gate.height === height);
    }

    private areHousesValid(village: IVillage): boolean {
        return village.houses.every(house => 
            house.x >= 0 && house.y >= 0 &&
            house.x + house.width <= village.width &&
            house.y + house.height <= village.height
        );
    }

    private isFenceValid(village: IVillage): boolean {
        return village.fence.every(position =>
            position.x >= 0 && position.y >= 0 &&
            position.x < village.width && position.y < village.height
        );
    }
}

// ============ Основной класс генератора ============

export class VillageGenerator {
    private readonly grid: IGrid;
    private readonly random: IRandomService;
    private readonly pathFinder: IPathFinder;
    private readonly validator: IVillageValidator;
    private readonly config: IVillageGeneratorConfig;
    
    private gate: IGate | null = null;
    private houses: IHouse[] = [];
    private fence: IPosition[] = [];
    private roads: IPosition[] = [];
    private residents: IPosition[] = [];

    constructor(
        private readonly width: number,
        private readonly height: number,
        config?: Partial<IVillageGeneratorConfig>
    ) {
        this.config = this.mergeConfig(config || {});
        this.validateVillageSize();
        
        this.grid = new Grid(width, height);
        this.random = new RandomService();
        this.pathFinder = new PathFinder();
        this.validator = new VillageValidator();
    }

    public generate(): IVillage {
        this.resetState();
        
        this.placeGate();
        this.placeFence();
        this.placeHouses();
        this.buildRoads();
        this.placeResidents();

        const village = this.buildVillage();
        
        if (!this.validator.validate(village)) {
            throw new Error('Generated village is invalid');
        }

        return village;
    }

    public visualize(): string {
        const grid: string[][] = Array.from({ length: this.height }, () =>
            Array(this.width).fill('·')
        );

        this.applyToGrid(grid, this.fence, '#');
        this.applyToGrid(grid, [this.gate!], 'G');
        this.applyToGridRectangles(grid, this.houses, 'H');
        this.applyToGrid(grid, this.roads, 'R');
        this.applyToGrid(grid, this.residents, 'P');

        return grid.map(row => row.join('')).join('\n');
    }

    private resetState(): void {
        this.gate = null;
        this.houses = [];
        this.fence = [];
        this.roads = [];
        this.residents = [];
        this.grid = new Grid(this.width, this.height);
    }

    private validateVillageSize(): void {
        if (this.width < this.config.minVillageSize || 
            this.height < this.config.minVillageSize) {
            throw new Error(
                `Village size must be at least ${this.config.minVillageSize}x${this.config.minVillageSize}`
            );
        }
    }

    private mergeConfig(config: Partial<IVillageGeneratorConfig>): IVillageGeneratorConfig {
        const defaults = new VillageGeneratorConfig();
        return {
            minVillageSize: config.minVillageSize ?? defaults.minVillageSize,
            gateSize: config.gateSize ?? defaults.gateSize,
            houseSizes: config.houseSizes ?? defaults.houseSizes,
            houseGap: config.houseGap ?? defaults.houseGap,
            minOccupancyRate: config.minOccupancyRate ?? defaults.minOccupancyRate,
            maxOccupancyRate: config.maxOccupancyRate ?? defaults.maxOccupancyRate,
            maxPlacementAttempts: config.maxPlacementAttempts ?? defaults.maxPlacementAttempts
        };
    }

    // ============ Размещение ворот ============

    private placeGate(): void {
        const direction = this.random.pickRandom(Object.values(Direction));
        const gateSize = this.config.gateSize;
        
        const gate = this.createGateOnEdge(direction, gateSize);
        this.gate = gate;
        this.grid.occupyArea(gate);
    }

    private createGateOnEdge(direction: Direction, size: number): IGate {
        const positions = this.getPossibleGatePositions(direction, size);
        const selected = this.random.pickRandom(positions);
        
        return {
            x: selected.x,
            y: selected.y,
            width: direction === Direction.North || direction === Direction.South ? size : size,
            height: direction === Direction.East || direction === Direction.West ? size : size
        };
    }

    private getPossibleGatePositions(direction: Direction, size: number): IPosition[] {
        const positions: IPosition[] = [];
        
        switch (direction) {
            case Direction.North:
                for (let x = 1; x < this.width - size - 1; x++) {
                    positions.push({ x, y: 0 });
                }
                break;
            case Direction.South:
                for (let x = 1; x < this.width - size - 1; x++) {
                    positions.push({ x, y: this.height - size });
                }
                break;
            case Direction.West:
                for (let y = 1; y < this.height - size - 1; y++) {
                    positions.push({ x: 0, y });
                }
                break;
            case Direction.East:
                for (let y = 1; y < this.height - size - 1; y++) {
                    positions.push({ x: this.width - size, y });
                }
                break;
        }
        
        return positions;
    }

    // ============ Размещение забора ============

    private placeFence(): void {
        const fence: IPosition[] = [];
        const gate = this.gate!;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.isBorderCell(x, y) && !this.isGateCell(x, y, gate)) {
                    const pos = { x, y };
                    fence.push(pos);
                    this.grid.occupy(pos);
                }
            }
        }

        this.fence = fence;
    }

    private isBorderCell(x: number, y: number): boolean {
        return y === 0 || y === this.height - 1 || 
               x === 0 || x === this.width - 1;
    }

    private isGateCell(x: number, y: number, gate: IGate): boolean {
        return x >= gate.x && x < gate.x + gate.width &&
               y >= gate.y && y < gate.y + gate.height;
    }

    // ============ Размещение домов ============

    private placeHouses(): void {
        const targetOccupancy = this.calculateTargetOccupancy();
        let currentOccupancy = 0;
        let attempts = 0;

        while (currentOccupancy < targetOccupancy && 
               attempts < this.config.maxPlacementAttempts) {
            attempts++;
            
            const houseSize = this.random.pickRandom(this.config.houseSizes);
            const position = this.findFreePosition(houseSize);
            
            if (position) {
                const house = { ...position, ...houseSize };
                this.houses.push(house);
                this.grid.occupyArea(house);
                currentOccupancy += houseSize.width * houseSize.height;
            }
        }
    }

    private calculateTargetOccupancy(): number {
        const freeArea = this.grid.getFreeArea();
        const rate = this.random.nextFloat(
            this.config.minOccupancyRate,
            this.config.maxOccupancyRate
        );
        return freeArea * rate;
    }

    private findFreePosition(size: ISize): IPosition | null {
        const maxAttempts = 100;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const x = this.random.nextInt(0, this.width - size.width);
            const y = this.random.nextInt(0, this.height - size.height);
            
            const rect = { x, y, width: size.width, height: size.height };
            
            if (this.grid.isAreaFree(rect, this.config.houseGap)) {
                return { x, y };
            }
        }
        
        return null;
    }

    // ============ Построение дорог ============

    private buildRoads(): void {
        const allRoads: IPosition[] = [];
        const gateCenter = this.getGateCenter();

        for (const house of this.houses) {
            const houseCenter = this.getHouseCenter(house);
            const path = this.pathFinder.findPath(houseCenter, gateCenter);
            allRoads.push(...path);
        }

        this.roads = this.uniquePositions(allRoads);
        
        for (const road of this.roads) {
            this.grid.occupy(road);
        }
    }

    private getGateCenter(): IPosition {
        const gate = this.gate!;
        return {
            x: gate.x + Math.floor(gate.width / 2),
            y: gate.y + Math.floor(gate.height / 2)
        };
    }

    private getHouseCenter(house: IHouse): IPosition {
        return {
            x: house.x + Math.floor(house.width / 2),
            y: house.y + Math.floor(house.height / 2)
        };
    }

    // ============ Размещение жителей ============

    private placeResidents(): void {
        const residents: IPosition[] = [];

        for (const road of this.roads) {
            const neighbors = this.getNeighbors(road);
            
            for (const neighbor of neighbors) {
                if (this.isValidResidentPosition(neighbor, residents)) {
                    residents.push(neighbor);
                    this.grid.occupy(neighbor);
                }
            }
        }

        this.residents = residents;
    }

    private getNeighbors(position: IPosition): IPosition[] {
        const directions = [
            { x: -1, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: -1 },
            { x: 0, y: 1 }
        ];

        return directions
            .map(dir => ({ x: position.x + dir.x, y: position.y + dir.y }))
            .filter(pos => this.isInBounds(pos));
    }

    private isValidResidentPosition(position: IPosition, existingResidents: IPosition[]): boolean {
        return this.isInBounds(position) &&
               !this.grid.isOccupied(position) &&
               !this.isPositionInArray(position, existingResidents);
    }

    // ============ Вспомогательные методы ============

    private isInBounds(position: IPosition): boolean {
        return position.x >= 0 && position.x < this.width &&
               position.y >= 0 && position.y < this.height;
    }

    private isPositionInArray(position: IPosition, array: IPosition[]): boolean {
        return array.some(p => p.x === position.x && p.y === position.y);
    }

    private uniquePositions(positions: IPosition[]): IPosition[] {
        const seen = new Set<string>();
        const result: IPosition[] = [];

        for (const pos of positions) {
            const key = `${pos.x},${pos.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(pos);
            }
        }

        return result;
    }

    private buildVillage(): IVillage {
        return {
            width: this.width,
            height: this.height,
            gate: this.gate!,
            fence: this.fence,
            houses: this.houses,
            roads: this.roads,
            residents: this.residents
        };
    }

    // ============ Методы для визуализации ============

    private applyToGrid(grid: string[][], positions: IPosition[], char: string): void {
        for (const pos of positions) {
            if (this.isInBounds(pos)) {
                grid[pos.y][pos.x] = char;
            }
        }
    }

    private applyToGridRectangles(grid: string[][], rectangles: IRectangle[], char: string): void {
        for (const rect of rectangles) {
            for (let y = rect.y; y < rect.y + rect.height; y++) {
                for (let x = rect.x; x < rect.x + rect.width; x++) {
                    if (this.isInBounds({ x, y })) {
                        grid[y][x] = char;
                    }
                }
            }
        }
    }
}

// ============ Пример использования ============

export function demoVillageGeneration(): void {
    try {
        const generator = new VillageGenerator(20, 20);
        const village = generator.generate();
        
        console.log('🏘️ Деревня успешно сгенерирована!');
        console.log(`📐 Размер: ${village.width}x${village.height}`);
        console.log(`🚪 Ворота: (${village.gate.x}, ${village.gate.y}) размер ${village.gate.width}x${village.gate.height}`);
        console.log(`🏠 Домов: ${village.houses.length}`);
        console.log(`🛤️ Дорог: ${village.roads.length}`);
        console.log(`👤 Жителей: ${village.residents.length}`);
        console.log(`🧱 Забор: ${village.fence.length} секций`);
        
        console.log('\n🗺️ Визуализация:');
        console.log('Легенда: G-ворота, #-забор, H-дом, R-дорога, P-житель, ·-свободно');
        console.log(generator.visualize());
        
    } catch (error) {
        console.error('❌ Ошибка генерации:', error.message);
    }
}

// Запуск демонстрации
if (require.main === module) {
    demoVillageGeneration();
}