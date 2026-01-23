///<reference path="midi.js" />
class FQ {
    /**
     * midi对象转换为番茄简谱脚本
     * @param {midi} mid 待转换的midi对象
     * @param {number} barNum 几小节一行
     * @returns {string} 番茄简谱脚本
     */
    static mid2fanqie(mid, barNum = 4) {
        const fqnote = ["1", "1#", "2", "2#", "3", "4", "4#", "5", "5#", "6", "6#", "7"];
        const fqtime = ['////', '///', '//', '/', '-']
        var j = mid.JSON();
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
        let results = Array.from(j.tracks, x => atrack(x).split('|'));
        //脚本头
        let o = `B: ${j.header.name}\nZ: 佚名词曲\nD: C\n`;
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
        }
        return o;
    }
}