# 天命 · 程序化战斗演示（v1.0）

一个致敬《黑神话：悟空》的浏览器 3D 动作战斗 Demo：**角色、毛发、贴图、布料、动画、场景、音效全部由代码实时生成**，零外部美术资产；同时支持接入你自己有授权的 GLB/FBX 角色与 Mixamo 动画。

> 非官方粉丝作品，与 Game Science / 游戏科学无关，不包含任何游戏原版资产。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5288 。需要支持 WebGL2 的独立显卡以获得流畅帧率。

## 操作

| 按键 | 动作 |
|---|---|
| WASD / Shift | 移动 / 疾跑 |
| 鼠标左键（或 J） | 轻棍四连 |
| 鼠标右键长按（或 K） | 蓄力劈棍（三段蓄力 + 棍势加成） |
| 空格 | 闪身（无敌帧，精准闪避触发「识破」慢动作） |
| 1 / F | 定身法 |
| R | 饮葫芦回血 |
| Q / 鼠标中键 | 锁定 |
| Esc | 返回菜单 |

标题界面的「形神鉴赏」可 360° 查看角色并逐个播放全部动作。

## 内容一览

- **天命人**：雕刻式猴首、壳层毛发（实例化 Shell Fur）、金冠凤翅、Verlet 翎羽、虎皮裙布料模拟、缠腕绑腿、念珠、可摆动的猴尾、如意金箍棒。
- **苍狼校卫**：狼首鬃毛、札甲、绛红袍、大刀；追击 / 劈斩 / 横斩 / 跃斩 / 旋斩、半血狂怒、破绽硬直。
- **动画**：控制骨架 + 两骨骼 IK + 关键帧姿势混合，程序化步态。
- **战斗**：命中窗口、连招窗口、顿帧、慢动作、棍势、定身、完美闪避、地裂冲击波。
- **场景**：黄昏古寺庭院、反宇飞檐大殿、石灯笼、香鼎、松林、草地、落叶、体积光、水墨远山。
- **渲染**：PBR + PMREM 环境光、软阴影、Bloom、调色 / 暗角 / 径向模糊后处理。
- **音频**：WebAudio 实时合成音效 + Karplus-Strong 古筝配乐。

## 接入外部角色（可选）

支持 GLB / GLTF / FBX（含 Draco、Meshopt 压缩）。自动识别 Mixamo / Unreal / Blender Rigify / 3ds Max Biped / VRM 骨骼命名，世界空间重定向并按静止姿势对齐（T-Pose 动画可直接用于 A-Pose 模型）。

详见 [public/assets/使用说明.md](public/assets/使用说明.md)，配置模板 [public/assets/assets.example.json](public/assets/assets.example.json)。地址加 `#selftest` 可运行合成资产的端到端自检。

请只使用你有合法授权的资产；`public/assets/` 下的模型文件默认不会提交到仓库。

## 项目结构

```
src/
  core/        噪声、程序化贴图、几何工具、壳层毛发
  characters/  天命人 / 狼校卫 建模与共享部件
  anim/        姿势、IK 骨架、动作库与播放器
  sim/         布料、翎羽物理
  world/       场景
  fx/          粒子、拖尾、冲击波、残影、法阵
  game/        角色运行时、玩家控制、敌人 AI、外部蒙皮角色
  assets/      外部资产加载、骨骼识别、重定向、自检
  audio/       程序化音效与配乐
```

## 技术栈

[Three.js](https://threejs.org/) r169 · [Vite](https://vitejs.dev/) 5

## 许可证

代码以 [MIT](LICENSE) 协议开源。`public/draco/` 中的 Draco 解码器来自 Google Draco（Apache-2.0）。《黑神话：悟空》及相关角色名称归 Game Science 所有，本项目为非官方致敬作品。
