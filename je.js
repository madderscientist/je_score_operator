class JE {
    static upNotes = ["1", "#1", "2", "#2", "3", "4", "#4", "5", "#5", "6", "#6", "7"];
    static downNotes = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];
    static note = JE.upNotes;
    /**
     * je谱转调函数
     * @param {string} bef 要转换的内容
     * @param {number} x 输入半音数目，正则升，负则降
     * @param {string[]} Note_aft 转换后的对照表
     * @param {boolean} autoup 是否自动升号
     * @returns {string} 转换后的内容
     */
    static convert(bef, x, Note_aft = JE.note, autoup = false) {
        let aft = '';               // 转换后
        let n = 0;                  // 位置
        let octave = 0;             // 八度音高
        let lastm = 0;              // 用于自动升降号，记录上一个音是否升
        while (n < bef.length) {
            let m = 0;                //升降半音
            if (bef[n] == ')' || bef[n] == '[') ++octave;
            else if (bef[n] == '(' || bef[n] == ']') --octave;
            else {
                if (bef[n] == '#') m = 1;
                else if (bef[n] == 'b') m = -1;
                let position = JE.note.indexOf(bef[n + Math.abs(m)]);      //在列表中的位置
                let N = 0;            //结果的位置
                let name = '';        //音名
                let pitch = 0;        //音高
                let brackets = '';    //括号
                if (position == -1) {
                    m = 0;
                    aft = aft + bef[n];
                } else {
                    N = m + position + x;
                    pitch = octave + Math.floor(N / 12);
                    N = (N % 12 + 12) % 12; // 取N除12的模，不是余数！
                    if (autoup) {           // 自动升号，针对#3和#7 原理是如果上一个升了，且这个是4或1就变为升记号的形式
                        if (N == 0 && lastm == 1) {
                            name = '(#7)';
                        } else if (N == 5 && lastm == 1) {
                            name = '#3';
                        } else name = Note_aft[N];
                        lastm = name.includes("#") ? 1 : 0;
                    } else name = Note_aft[N];
                    for (let i = 1; i <= Math.abs(pitch); i++) brackets = brackets + '[';
                    aft = aft + ((pitch > 0) ? brackets : brackets.replace(/\[/g, '(')) + name + ((pitch > 0) ? brackets.replace(/\[/g, ']') : brackets.replace(/\[/g, ')'));
                }
            }
            n = n + Math.abs(m) + 1;
        }
        return aft;
    }

    /**
     * 计算某字符串中某子串出现的次数
     * @param {string} content 
     * @param {string} key 字串
     * @returns {number} 次数
     */
    static countkey(content, key) {
        return content.length - content.replace(new RegExp(key, "gm"), '').length;
    }

    /**
     * 一键最简（#最少）
     * @param {string} bef 
     * @returns {string} 最简调号的谱
     */
    static simplified(bef) {
        let downtimes = 0;
        let aft = '';
        aft = JE.convert(bef, 0);
        let amount = JE.countkey(aft, '#');
        let min = amount;
        for (let i = 1; i < 12; i++) {
            aft = JE.convert(aft, -1);
            amount = JE.countkey(aft, '#');
            if (amount < min) {
                min = amount;
                downtimes = i;
                if (min == 0) break;
            }
        }
        alert("降" + downtimes + "调，最少" + min + "个“#”");
        return JE.convert(bef, -downtimes);
    }

    /**
     * 找到极值音，返回序号（[最低，最高]）
     * @param {string} content 
     * @returns {[number, number]} 最低音和最高音的编码
     */
    static findExtreme(content) {
        let len = content.length;
        let octave = 0;
        let lowest = 0.1;
        let highest = 0.1;
        let n = 0;
        while (n < len) {
            while (n < len) {   //检测括号，判断八度
                if (content[n] == "[" || content[n] == ")") octave += 12;
                else if (content[n] == "]" || content[n] == "(") octave -= 12;
                else break;
                n++;
            }
            if (n < len) {
                let up = 0;       //半音关系
                if (content[n] == "#") up = 1;
                else if (content[n] == "b") up = -1;
                let N = n + Math.abs(up);
                if (N < len) {
                    let position = JE.note.indexOf(content[N]);
                    if (position < 0) n++;    //不在表格里
                    else {
                        position = position + up + octave;
                        if (position < lowest || lowest == 0.1) lowest = position;
                        if (position > highest || highest == 0.1) highest = position;
                        n = N + 1;
                    }
                }
                else break; //就是结束了，或者#后面没有东西了
            }
        }
        return [lowest, highest];
    }

    /**
     * 把序号转换为je音符，0 -> 1
     * @param {number} index 编码
     * @param {string[]} noteMap 音符对照表
     * @returns {string} je谱表示法
     */
    static indexToje(index, noteMap = JE.note) {
        if (index != (index | 0)) return '';
        let position = (index % 12 + 12) % 12;
        let k = Math.floor(index / 12);
        let brackets = '';
        for (let i = 0; i < Math.abs(k); i++) {
            brackets = brackets + '[';
        }
        return ((k > 0) ? brackets : brackets.replace(/\[/g, '(')) + noteMap[position] + ((k > 0) ? brackets.replace(/\[/g, ']') : brackets.replace(/\[/g, ')'));
    }
}