///<reference path="je.js" />
///<reference path="midi.js" />

// 没有实现: 倚音解析 力度变化 乱七八糟的符号 临时伴奏/多声部 `&`开头的指令
// 临时节拍语法: `|"p:3/4"`
// 临时调号语法: 写音符后面 `5"1=D"`
// 临时BPM语法: 写哪都可以 `5"bpm:120"`
// 其他语法: http://doc.lezhi99.com/zhipu
class FQ {
    // 简谱数字对应的半音增量 (1=0, 2=2, 3=4, 4=5, 5=7, 6=9, 7=11)
    static scaleIntervals = { '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11 };
    static keyOffsets = {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
        'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
    // 以下的单位：除了特别说明，"拍"均指四分音符
    static FQNote = class {
        constructor(pitch, startTime, duration, graceBefore, graceAfter) {
            this.pitch = pitch;// MIDI音高
            this.time = startTime;// 开始时间 (拍)
            this.duration = duration;// 时值 (拍)
            this.graceBefore = graceBefore;// 前倚音列表
            this.graceAfter = graceAfter;// 后倚音列表
        }
        ///<reference path="je.js" />
        toJE() {
            return JE.indexToje(this.pitch - 60);
        }
    };

    static FQtrack = class {
        constructor(id, name, notes) {
            this.id = id;
            this.name = name;
            // 删去所有休止符
            this.notes = notes.filter(n => !isNaN(n.pitch));
            this.notes.sort((a, b) => a.time - b.time);
        }
        toJE() {
            let result = `Track${this.id}${this.name.length ? ' ' + this.name : ''}:\n`;
            // 用低通滤波管理时长
            let t = 2;
            for (const note of this.notes) {
                result += note.toJE();
                if (t < 0) t = note.duration;
                if (note.duration > t * 2) result += '\n';
                else if (note.duration > t * 1.5) result += ' ';
                t = t * 0.3 + note.duration * 0.7;
            } return result;
        }
    };

    static FQSignature = class {
        static defaultBeatsPerBar = 4.0; // 默认4/4拍
        constructor(time, topNum, bottomNum) {
            this.time = time;
            this.topNum = topNum;
            this.bottomNum = bottomNum;
        }
        // 计算每小节四分音符的数目
        get beatsPerBar() {
            return (this.topNum / this.bottomNum) * 4.0;
        }
    };

    static FQContext = class {
        currentTime;// 当前时间 (拍)
        baseMidi;   // { time: number, midi: number }[]
        timeSignatures; // FQSignature[]
        bpmChanges; // { time: number, bpm: number }[]
        constructor(options = {}) {
            Object.assign(this, {
                currentTime: 0,
                baseMidi: [{ time: 0, midi: 60 }], // { time: number, midi: number }[]
                strictMeasure: false,   // 是否严格对其小节时间（遇到小节线强制校准时间）
                singleNoteAccidentals: false,   // 临时升降号是否仅作用于单音（true=不记忆小节状态，false=记忆小节状态）
                barAccidentals: {}, // 小节内升降号记忆 e.g.{ '1': 1, '4': -1 }
                timeSignatures: [], // 记录拍号变更，格式 { time: number, topNum: number, bottomNum: number }
                bpmChanges: [],     // 记录bpm变更，格式 { time: number, bpm: number}
            }, options);
        }
        addSignature(time, topNum, bottomNum) {
            const existing = this.timeSignatures.find(ts => Math.abs(ts.time - time) < 1e-6);
            if (existing) {
                // 覆盖
                existing.topNum = topNum;
                existing.bottomNum = bottomNum;
                return existing;
            }
            const sig = new FQ.FQSignature(time, topNum, bottomNum);
            this.timeSignatures.push(sig);
            this.timeSignatures.sort((a, b) => a.time - b.time);
            return sig;
        }
        static _at(time, arr, returnIdx = false) {
            time += 1e-6; // 避免边界问题
            let left = 0, right = arr.length - 1, res = -1;
            while (left <= right) {
                const mid = (left + right) >> 1;
                if (arr[mid].time <= time) {
                    res = mid;
                    left = mid + 1;
                } else right = mid - 1;
            } return returnIdx ? res : (res !== -1 ? arr[res] : null);
        }
        signatureAt(time = this.currentTime) { return FQ.FQContext._at(time, this.timeSignatures); }
        addBaseMidi(time, midi) {
            const existing = this.baseMidi.find(bm => Math.abs(bm.time - time) < 1e-6);
            if (existing) {
                existing.midi = midi;
                return existing;
            }
            const bm = { time, midi };
            this.baseMidi.push(bm);
            this.baseMidi.sort((a, b) => a.time - b.time);
            return bm;
        }
        baseMidiAt(time = this.currentTime) { return FQ.FQContext._at(time, this.baseMidi)?.midi ?? 60; }
        currentMeasureStart() {
            let t = 0;
            let beatsPerBar = FQ.FQSignature.defaultBeatsPerBar;
            const sig = this.signatureAt(this.currentTime);
            if (sig) {
                t = sig.time;
                beatsPerBar = sig.beatsPerBar;
            }
            const dt = this.currentTime - t;
            return t + Math.floor(dt / beatsPerBar) * beatsPerBar;
        }
        addBPMChange(time, bpm) {
            const existing = this.bpmChanges.find(bm => Math.abs(bm.time - time) < 1e-6);
            if (existing) {
                existing.bpm = bpm;
                return existing;
            }
            const bc = { time, bpm };
            this.bpmChanges.push(bc);
            this.bpmChanges.sort((a, b) => a.time - b.time);
            return bc;
        }
    };

    /**
     * 解析番茄简谱脚本
     * @param {string} script 简谱脚本内容
     * @param {boolean} strictMeasure 是否严格对齐小节
     * @param {boolean} singleNoteAccidentals 临时升降号是否仅作用于单音
     */
    constructor(script, strictMeasure = false, singleNoteAccidentals = false) {
        const parsed = FQ.parse(script, strictMeasure, singleNoteAccidentals);
        this.title = parsed.title;
        this.tracks = parsed.tracks;
        this.timeSignatures = parsed.timeSignatures;
        this.bpmChanges = parsed.bpmChanges;
    }

    /**
     * 主解析入口
     * @param {string} content 文件内容
     * @param {boolean} strictMeasure 是否严格对齐小节
     * @param {boolean} singleNoteAccidentals 临时升降号是否仅作用于单音
     */
    static parse(content, strictMeasure = false, singleNoteAccidentals = false) {
        const lines = content.split(/\r?\n/);
        const meta = {
            title: '',
            author: '',
            key: 'C',
            bpm: 120,
            timeSignature: '4/4',
            baseMidi: 60 // 默认 1=C (Middle C)
        };

        // 原始轨道数据暂存 { "1": { name: "", source: "" } }
        const rawTracks = {};

        // 预处理：读取头信息和分离轨道
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            /* 解析头部
            V: 版本号
            B: 标题
            Z: 作者
            D: 调性 一个大写字母
            P: 2/4
            J: 速度
            */
            if (line.match(/^[VBZDP]:/)) {
                const type = line.charAt(0);
                const val = line.substring(2).trim();
                switch (type) {
                    case 'B': meta.title += val; break;
                    case 'Z': meta.author += val; break;
                    case 'D':
                        meta.key = FQ.parseKeySignature(val);
                        meta.baseMidi = 60 + (FQ.keyOffsets[meta.key] || 0);
                        break;
                    case 'P': meta.timeSignature = val; break;
                    case 'J': meta.bpm = parseFloat(val); break;
                } return;
            }

            // 解析简谱行 Q
            if (line.startsWith('Q')) {
                // 匹配 Q1"名称": 或 Q:
                const match = line.match(/^Q(\d+)?(?:"(.*?)")?:(.*)/);
                if (match) {
                    const trackId = match[1] || '0'; // 如果没有数字，默认为轨道0
                    const trackName = match[2] || '';
                    const trackContent = match[3];

                    if (!rawTracks[trackId]) {
                        rawTracks[trackId] = { id: trackId, name: trackName, source: '' };
                    }
                    if (trackName) rawTracks[trackId].name = trackName; // 更新名称
                    rawTracks[trackId].source += trackContent + " ";
                }
            }
        });

        const signature = meta.timeSignature.split('/');
        if (signature.length !== 2) {
            signature[0] = '4';
            signature[1] = '4';
        }
        const context = new FQ.FQContext({
            baseMidi: [{ time: 0, midi: meta.baseMidi }],
            timeSignatures: [new FQ.FQSignature(0, parseInt(signature[0]), parseInt(signature[1]))],
            bpmChanges: [{ time: 0, bpm: meta.bpm || 120 }],
            strictMeasure: strictMeasure,
            singleNoteAccidentals: singleNoteAccidentals
        });
        // 解析每个音轨
        const tracks = Object.values(rawTracks).map(track => {
            context.currentTime = 0;
            context.barAccidentals = {};
            return new FQ.FQtrack(
                track.id,
                track.name,
                FQ.parseTrackContent(
                    track.source, context
                )
            );
        });
        return {
            title: meta.title,
            tracks: tracks,
            timeSignatures: context.timeSignatures,
            bpmChanges: context.bpmChanges,
        };
    }

    /**
     * 解析调号字符串 "1=D" -> "D", "E" -> "E", "Key:Bb" -> "Bb"
     * @param {string} str 可能出现在调号位置的字符串
     * @returns {string} 调号字符串
     */
    static parseKeySignature(str) {
        // 移除 1= 或 Key: 等前缀
        const clean = str.replace(/^1=|^Key:/i, '').replace(/\s+/g, '').trim();
        // 匹配 C, D#, Bb 等
        const match = clean.match(/^[A-G][#b$]?/);
        return match ? match[0].replace('$', 'b') : 'C'; // 兼容 $ 作为降号
    }

    /**
     * 解析单个音轨的内容
     * @param {string} source 音轨字符串
     * @param {FQ.FQContext} context 解析上下文
     */
    static parseTrackContent(source, context) {
        let beatsPerBar = context.signatureAt(0)?.beatsPerBar ?? FQ.FQSignature.defaultBeatsPerBar;
        let currentMeasureStart = context.currentMeasureStart(); // 当前小节起始时间（拍）

        // 快速查找
        let signatureIndex = FQ.FQContext._at(context.currentTime, context.timeSignatures, true);
        let baseMidiIndex = FQ.FQContext._at(context.currentTime, context.baseMidi, true);
        const updateSignatureIndex = () => {
            const t = context.currentTime + 1e-6;
            while (signatureIndex + 1 < context.timeSignatures.length) {
                const nextSig = context.timeSignatures[signatureIndex + 1];
                if (nextSig.time <= t) signatureIndex++;
                else break;
            }
        };
        const updateBaseMidiIndex = () => {
            const t = context.currentTime + 1e-6;
            while (baseMidiIndex + 1 < context.baseMidi.length) {
                const nextBm = context.baseMidi[baseMidiIndex + 1];
                if (nextBm.time <= t) baseMidiIndex++;
                else break;
            }
        };

        // 连音线栈：支持嵌套
        class SlurState extends Array {
            static slurStack = null;
            static push() {
                SlurState.slurStack = new SlurState();
            }
            static pop() {  // 返回值表示弹出的成功与否
                const curr = SlurState.slurStack;
                if (!curr) return false;
                const father = curr.father;
                if (!father) return false;    // 已经是顶层，忽视
                father.push.apply(father, curr);
                SlurState.slurStack = father;
                curr.length = 0; // 清空当前栈
                return true;
            }
            static addNote(note) {
                SlurState.slurStack?.push(note);
            }

            constructor() {
                super();
                this.father = SlurState.slurStack;
            }
            end() {
                // this.father == null: 自己是顶层，说明只有一个右括号，视为无效语法
                // this.father.father == null: 父层是顶层，顶层没有括号，只能和本层括号匹配
                if (this.length === 1 && this.father?.father) {
                    // 此时右括号结束的是父层的右括号 这是唯一一种删除父层的情况
                    if (this.father.length === 1 && this.father[0].pitch === this[0].pitch) {
                        // 满足 (X (X) 条件，将两层合并为只包含一个音符的一层
                        this[0].time = this.father[0].time;
                        this[0].duration += this.father[0].duration;
                        this[0].graceBefore = this.father[0].graceBefore;
                        this.father.length = 0;
                    }
                    // 删除父层
                    SlurState.slurStack = this.father;
                    const result = SlurState.pop();
                    this.father = SlurState.slurStack;
                    SlurState.slurStack = this;
                    return result;
                }
                if (this.length === 2 && this[0].pitch === this[1].pitch) {
                    // 满足 (X X) 条件，合并为一个音符
                    this[0].duration += this[1].duration;
                    this[0].graceAfter = this[1].graceAfter;
                    this.length = 1;
                }
                // 结束本层
                return SlurState.pop();
            }
        };
        SlurState.push();

        let i = 0;
        const len = source.length;
        while (i < len) {
            const char = source[i];

            // --- 忽略的字符 ---
            if (/\s/.test(char)) { i++; continue; } // 空白字符
            if (['>', '<', '!', '&'].includes(char)) {  // 前三个是力度记号
                // 忽略特殊控制符，如果是 & 后面通常跟字母(和加号)，跳过整个单词
                if (char === '&') {
                    while (i < len && /[a-zA-Z\+]/.test(source[i + 1])) i++;
                } i++; continue;
            }
            // --- 分页符 ---
            if (source.startsWith('[fenye]', i)) { i += 7; continue; }

            // --- 小节线 ---
            if (char === '|') {
                // 重置小节内临时升降号
                context.barAccidentals = {};
                // 严格小节对齐：校准 currentTime
                if (context.strictMeasure) context.currentTime = currentMeasureStart + beatsPerBar;
                // 更新下一小节的起始点
                currentMeasureStart = context.currentTime;
                i++;
                // 跳过小节线的修饰符 小节线有以下类型: `|` `||` `|:` `:|` `:|:` `||/` `|/` `|*`
                while (i < len && /[:*\/]/.test(source[i])) i++;
                // 3. 检查小节后的指令 (如 "p:2/4")
                while (source[i] === '"') {
                    const endQuote = source.indexOf('"', i + 1);
                    if (endQuote !== -1) {
                        const content = source.substring(i + 1, endQuote);
                        // 记录元数据
                        if (content.startsWith('p:')) {
                            // 更新当前拍数，用于下一次 strictMeasure 计算
                            const parts = content.substring(2).split('/');
                            if (parts.length === 2) {
                                const top = parseInt(parts[0]);
                                const bottom = parseInt(parts[1]);
                                context.addSignature(context.currentTime, top, bottom);
                            }
                        } i = endQuote + 1;
                    } else break;
                }
                // 更新 beatsPerBar 找到最近的拍号变更
                updateSignatureIndex();
                beatsPerBar = context.timeSignatures[signatureIndex]?.beatsPerBar ?? beatsPerBar;
                continue;
            }

            if (char === '"') {
                const endQuote = source.indexOf('"', i + 1);
                if (endQuote === -1) {
                    alert("简谱注释没有闭合引号！");
                    break;
                }
                const content = source.substring(i + 1, endQuote);
                if (content.startsWith('bpm:')) {
                    const bpm = parseFloat(content.substring(4));
                    context.addBPMChange(context.currentTime, bpm);
                } i = endQuote + 1; continue;
            }

            // --- 连音线 ---
            if (char === '(') {
                SlurState.push();
                i++; continue;
            }
            if (char === ')') {
                SlurState.slurStack?.end();
                i++; continue;
            }

            // --- 音符处理 (0-9) ---
            if (/[0-9]/.test(char)) {
                // 提取音符的基础属性
                // 返回: { digit, accidentals, hasNatural, octave, durationDivs, durationAdds, dots, annotation, nextIndex }
                const token = FQ.parseNoteToken(source, i);
                i = token.nextIndex;
                const digit = token.digit;

                // 计算时长 6/8拍时 即使没有减时线也是四分音符
                let duration = this.calculateDuration(1, token.durationDivs, token.durationAdds, token.dots);

                // 处理注释中的转调指令 转调只可能在这里出现
                if (token.annotation) {
                    let a = 0;
                    if (token.annotation.startsWith('转')) a = 1;
                    else if (token.annotation.startsWith('1=')) a = 2;
                    if (a != 0) {
                        const newKey = token.annotation.substring(a).replace('调', '');
                        const keyOffset = FQ.keyOffsets[newKey];
                        if (keyOffset !== undefined) {
                            context.addBaseMidi(context.currentTime, 60 + keyOffset);
                        }
                    }
                }
                // 更新baseMidiIndex
                updateBaseMidiIndex();

                // 计算音高
                let midiPitch = -128; // 默认给 "9" (节奏音) 的值
                if (digit >= 1 && digit <= 7) {
                    const scaleDegree = String(digit);
                    const baseMidi = context.baseMidi[baseMidiIndex]?.midi ?? 60;
                    let pitch = baseMidi + FQ.scaleIntervals[scaleDegree] + (token.octave * 12);

                    // 升降号
                    if (token.hasNatural) {
                        // 还原号：重置该音的小节 即使是singleNoteAccidentals模式
                        context.barAccidentals[scaleDegree] = 0;
                    } else if (token.accidentals !== 0) {
                        // 显式升降
                        if (!context.singleNoteAccidentals) {
                            context.barAccidentals[scaleDegree] = token.accidentals;
                        }
                        pitch += token.accidentals;
                    } else {
                        // 无符号：检查记忆
                        if (!context.singleNoteAccidentals && context.barAccidentals[scaleDegree] !== undefined) {
                            pitch += context.barAccidentals[scaleDegree];
                        }
                    } midiPitch = pitch;
                } else if (digit === 0) {
                    // 休止符，没有midi音符，但推进时间
                    // 能打断延长音线，需要将其push进去 最后清理
                    midiPitch = NaN;
                } else if (digit === 8) {
                    // 隐藏休止符，不占据时间
                    midiPitch = NaN;
                    duration = 0;
                }

                // 处理左括号 因为 3(--- 3) 也是合法的
                while (token.leftParenthesis > 0) {
                    SlurState.push();
                    token.leftParenthesis--;
                }

                // 处理倚音 返回的倚音需要重新解析 暂时先不实现
                const graceBefore = [];
                const graceAfter = [];
                if (token.graceBefore.length > 0) {}
                if (token.graceAfter.length > 0) {}

                // 正式创建音符
                const newNote = new FQ.FQNote(
                    midiPitch,
                    context.currentTime,
                    duration,
                    graceBefore.length ? graceBefore : undefined,
                    graceAfter.length ? graceAfter : undefined
                );
                SlurState.addNote(newNote);
                context.currentTime += duration;

                // 处理藏在音符里的右括号 常见写法为 (3 (3)--- 3)
                while (token.rightParenthesis > 0) {
                    SlurState.slurStack?.end();
                    token.rightParenthesis--;
                }
            } else i++;
        }

        // 处理没有闭合的括号
        while (SlurState.slurStack.end());
        return [...SlurState.slurStack];    // 清理类型
    }

    /**
     * 提取音符的文本特征（数字+修饰符）
     * @param {string} source 
     * @param {number} startIndex 
     */
    static parseNoteToken(source, startIndex) {
        let i = startIndex;
        const len = source.length;
        const digit = parseInt(source[i]);
        i++; // 消耗数字

        let accidentals = 0;    // 升降
        let octave = 0;         // 八度
        let durationDivs = 0;   // 减时线
        let durationAdds = 0;   // 增时线
        let dots = 0;           // 附点
        let hasNatural = false; // 是否有还原号
        let annotation = "";    // 注释
        let leftParenthesis = 0;
        let rightParenthesis = 0;
        // 倚音 先不解析
        let graceBefore = "";
        let graceAfter = "";

        while (i < len) {
            const c = source[i];
            if (c === '#') accidentals++;
            else if (c === '$') accidentals--;
            else if (c === '=') hasNatural = true;
            else if (c === "'") octave++;
            else if (c === ',') octave--;
            else if (c === '/') durationDivs++;
            else if (c === '-') durationAdds++;
            else if (c === '.') dots++;
            else if (c === ' ');   // 跳过空格
            else if (c === ')') rightParenthesis++;
            else if (c === '(') leftParenthesis++;
            else if (c === '"') {
                const endQ = source.indexOf('"', i + 1);
                if (endQ !== -1) {
                    annotation = source.substring(i + 1, endQ);
                    i = endQ;
                } else break;
            } else if (c === '[') {
                // 处理倚音
                let endBracket = source.indexOf(']', i);
                if (endBracket === -1) endBracket = len;    // 认为后面都是倚音
                const content = source.substring(i + 1, endBracket);
                const isPostGrace = content.startsWith('h');
                const graceSource = isPostGrace ? content.substring(1) : content;
                if (isPostGrace) graceAfter += graceSource;
                else graceBefore += graceSource;
                i = endBracket + 1;
            } else break; // 遇到 [ 或其他字符停止
            i++;
        }
        // 上面左括号检测应对的是 2(- | 2) 这种情况
        // 如果是 2( 3 则右括号属于下一个音符
        i--;
        while (i >= 0) {
            const c = source[i];
            if (c === '(') {
                leftParenthesis--;
                i--;
            } else if (c === ' ') i--;
            else break;
        }
        i++;
        return {
            digit, accidentals, hasNatural, octave,
            durationDivs, durationAdds, dots, annotation,
            leftParenthesis, rightParenthesis,
            graceBefore, graceAfter,
            nextIndex: i
        };
    }

    /**
     * 计算时长
     * @param {number} base 基础时值（拍）
     * @param {number} divs 减时线数量
     * @param {number} adds 增时线数量
     * @param {number} dots 附点数量
     * @returns {number} 计算后的时值（拍）
     */
    static calculateDuration(base, divs, adds, dots) {
        let dur = base;
        // 减时线
        if (divs > 0) dur = base / Math.pow(2, divs);
        // 附点
        if (dots > 0) {
            let add = dur;
            for (let d = 0; d < dots; d++) {
                add /= 2;
                dur += add;
            }
        }
        // 增时线 (加法)
        dur += adds;
        return dur;
    }

    /**
     * 转换为je谱
     */
    toJE() {
        let result = '';
        for (const track of this.tracks)
            result += track.toJE() + '\n\n';
        return result;
    }

    /**
     * 转换为midi对象
     * @returns {midi} midi对象
     */
    toMidi() {
        let bpm0 = 120;
        let bpm_left = [...this.bpmChanges];
        if (this.bpmChanges.length > 0 && this.bpmChanges[0].time < 1e-6) {
            bpm0 = this.bpmChanges[0].bpm;
            bpm_left.shift();
        }
        let time_signature0 = [4, 4];
        let time_signature_left = [...this.timeSignatures];
        if (this.timeSignatures.length > 0 && this.timeSignatures[0].time < 1e-6) {
            time_signature0 = [this.timeSignatures[0].topNum, this.timeSignatures[0].bottomNum];
            time_signature_left.shift();
        }
        const mid = new midi(bpm0, time_signature0, 480, [], this.title);
        for (const track of this.tracks) {
            const mt = mid.addTrack(new mtrk(track.name));
            for (const note of track.notes) {
                mt.addEvent(midiEvent.note(
                    note.time * mid.tick,
                    note.duration * mid.tick,
                    note.pitch, 100
                ));
            }
        }
        // 其余控制信息加在第一个轨道中
        if (mid.Mtrk.length > 1) {
            const mt0 = mid.Mtrk[0];
            for (const ts of time_signature_left) {
                mt0.addEvent(midiEvent.time_signature(
                    ts.time * mid.tick,
                    ts.topNum,
                    ts.bottomNum
                ));
            }
            for (const bpm of bpm_left) {
                mt0.addEvent(midiEvent.tempo(
                    bpm.time * mid.tick,
                    bpm.bpm
                ));
            }
        }
        return mid;
    }

    ///<reference path="midi.js" />
    /**
     * midi对象转换为番茄简谱脚本
     * @param {midi} mid 待转换的midi对象
     * @param {number} barNum 几小节一行
     * @returns {string} 番茄简谱脚本
     */
    static mid2fanqie(mid, barNum = 4) {
        const fqnote = ["1", "1#", "2", "2#", "3", "4", "4#", "5", "5#", "6", "6#", "7"];
        const fqtime = ['////', '///', '//', '/', '-']
        const j = mid.JSON();
        let anote = j.header.tick;
        // 最长时间
        let maxtick = 0;
        for (let i = 0; i < j.tracks.length; i++) {
            let temp = j.tracks[i].notes;
            if (!temp.length) continue;
            temp = temp[temp.length - 1];
            maxtick = Math.max(maxtick, temp.ticks + temp.durationTicks);
        }
        function indexTofq(index) {     //mid序号转番茄简谱音符
            index -= 60;
            let position = (index % 12 + 12) % 12;
            let k = Math.floor(index / 12);
            let brackets = '';
            for (let i = 0; i < Math.abs(k); i++) {
                brackets = brackets + "'";
            }
            return fqnote[position] + ((k > 0) ? brackets : brackets.replace(/\'/g, ","));
        }
        function atrack(t) {
            /* [tick, priority, text]
            音符结束    -1
            小节线      0       |
            节奏型      1       "p:?/?"
            音符开始    3
            速度标记    8       "bpm:"
            */
            let es = [];
            // 添加音符
            for (let i = 0; i < t.notes.length; i++) {
                let n = t.notes[i];
                let fqnote = indexTofq(n.midi);
                let start = [n.ticks, 3, fqnote, ''];   // 最后一位是前缀
                let end = [n.ticks + n.durationTicks, -1, fqnote];
                es.push(start, end);
            }
            // 添加拍号和小节号
            let temp = j.header.timeSignatures;
            for (let i = 0; i < temp.length; i++) {
                es.push([temp[i].ticks, 1, `"p:${temp[i].timeSignature[0]}/${temp[i].timeSignature[1]}"`]);
                let step = Math.round(anote * temp[i].timeSignature[0] / Math.pow(2, 2 - Math.log2(temp[i].timeSignature[1])));
                let endtick = temp[i + 1] ? temp[i + 1].ticks : maxtick;
                for (let k = temp[i].ticks + step; k <= endtick; k += step) {
                    es.push([k, 0, '', '|']);    // 最后一位是前缀
                }
            }
            // 添加bpm
            if (t.channel == 0) {
                temp = j.header.tempos;
                for (let i = 0; i < temp.length; i++) {
                    es.push([temp[i].ticks, 8, `"bpm:${temp[i].bpm}"`])
                }
            }
            es.sort((a, b) => {
                if (a[0] == b[0]) return a[1] - b[1];
                return a[0] - b[0];
            });
            // 重要前提：音符中无音符
            // 时值
            let lastid = -1;
            let lastnote = 0;
            let esi = 0;
            function TofqTime(time, note = 0) {
                time = Math.round(time * 16 / anote);
                let times = [];
                for (let i = 4; time > 0 && i >= 0; i--) {
                    let x = 1 << i;
                    while (time >= x) {
                        time -= x;
                        times.push(i);
                    }
                }

                time = '';
                if (lastnote == 0) {   // 休止符不用关心如何合并
                    for (let i = 0; i < times.length; i++)
                        if (times[i] == 4) time += '0';
                        else time += '0' + fqtime[times[i]];
                } else {
                    if (times.length == 0) return null;
                    // 优化成附点音符
                    let dotted = [];
                    let i = 0;
                    for (; i < times.length - 1; i++) {
                        if (times[i] - times[i + 1] == 1) dotted.push(fqtime[times[i++]] + '.');
                        else dotted.push(fqtime[times[i]]);
                    }
                    if (i < times.length) dotted.push(fqtime[times[i]]);
                    // 应该在es里面加一项，使小节线能加上括号
                    // 1. 找到最后一项 2. 最后一项插入esi处，且lastid=esi,esi++ 3. 最后一项前缀为前面的时值，返回它的时值
                    // 最后一项：1. 实际上的最后一项；2. 后面是‘-’；3. 此项为‘-.’
                    function insertNote() {
                        es[lastid][2] = '(' + es[lastid][2];
                        es.splice(esi, 0, [es[esi][0], -1, lastnote + ')', time.substr(lastnote.length + 2)]);
                        lastid = esi++;
                    }
                    let count = 0;
                    for (i = dotted.length - 1; i >= 0; i--) {
                        if (dotted[i] == '-.') {
                            if (count) insertNote(); // 一项以上
                            time = '.';
                            for (i--; i >= 0; i--) time += dotted[i];
                            break;
                        } else if (!dotted[i - 1]) {
                            if (count) {
                                insertNote();
                                time = '';
                            }
                            time += dotted[i].replace('-', '');
                            break;
                        } else if (dotted[i - 1] == '-') {
                            if (count) insertNote();
                            time = '';
                            for (i--; i >= 0; i--) time += dotted[i];
                            break;
                        } else {
                            time += '(' + lastnote + ')' + dotted[i];
                            count++;
                        }
                    }
                }
                return time;
            }
            for (; esi < es.length; esi++) {
                if (es[esi][1] == 3) {        // 音符开始。
                    // 如果lastnote==0，前面填充休止符; 如果上一个没结束，就结束上一个！
                    es[esi][3] = TofqTime(es[esi][0] - (lastid == -1 ? 0 : es[lastid][0]));
                    if (es[esi][3] == null) {  // 如果返回值为null，就把上一个清除
                        es[esi][3] = '';
                        es[lastid][2] = '';
                    }
                    lastid = esi;
                    lastnote = es[esi][2];
                } else if (es[esi][1] == -1) {    // 音符结束
                    if (lastnote == 0) es[esi][2] = '';  // 如果前面是空，则跳过这个
                    else if (lastnote == es[esi][2]) {     // 如果lastnote和这个不一样，说明是被提前结束了的，跳过
                        es[esi][2] = TofqTime(es[esi][0] - es[lastid][0]);
                        lastid = esi;
                        lastnote = 0;
                    }
                } else if (es[esi][1] == 0) {     // 小节线
                    if (lastnote == 0) {    // 前面填充休止符
                        es[esi][3] = TofqTime(es[esi][0] - (lastid == -1 ? 0 : es[lastid][0])) + '|';
                    } else {                // 结束上一个
                        es[esi][3] = TofqTime(es[esi][0] - es[lastid][0]);
                        if (es[esi][3] == null) {  // 上一个离小节线太近了，交换位置
                            es[esi][1] = es[lastid][1];
                            es[lastid][3] += '|';
                            es[esi][2] = es[lastid][2]
                            es[lastid][2] = '';
                            es[esi][3] = '';
                        } else {
                            // 上一个加(
                            es[lastid][2] = '(' + es[lastid][2];
                            // 这个改成【上一个的时值|note)】
                            es[esi][3] += '|';
                            es[esi][2] = lastnote + ')';
                        }
                    }
                    lastid = esi;
                }
            }
            temp = '';
            for (let i = 0; i < es.length; i++) {
                if (es[i].length == 4) {
                    temp += es[i][3];
                }
                temp += es[i][2];
            }
            return temp;
        }
        // 开始转换
        let results = Array.from(j.tracks)
            .filter(x => x.notes && x.notes.length > 0)
            .map(x => atrack(x).split('|'));
        //脚本头
        let o = `B: ${j.header.name}\nZ: 佚名词曲\nD: C\n`;
        const bpm0 = j.header.tempos[0];
        if (bpm0 && bpm0.ticks <= 1) o += `J: ${bpm0.bpm}\n`;
        const ts0 = j.header.timeSignatures[0];
        if (ts0 && ts0.ticks <= 1) o += `P: ${ts0.timeSignature[0]}/${ts0.timeSignature[1]}\n`;
        //拼接
        let linecount = 0;
        for (let i = 0; i < results[0].length; i += barNum) {   // 小节计数
            for (let k = 0; k < results.length; k++) {  // 对每一个音轨
                o += `Q${k + 1}: `;
                for (let p = 0; p < barNum && i + p < results[0].length; p++)
                    o += '|' + results[k][i + p];
                o += '|\n';
                linecount++;
            }
            if (linecount % 14 == 0) o += '[fenye]\n';
        } return o;
    }
}