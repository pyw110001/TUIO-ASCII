/**
 * 协议编码验证测试
 * 验证生成的帧是否符合协议要求
 */

import { ProtocolEncoder } from './server/protocol-encoder.js';

const encoder = new ProtocolEncoder();

console.log('协议编码验证测试\n');
console.log('='.repeat(50));

// 测试用例
const testCases = [
  { zoneId: 2, occupied: true, expected: '1C 02 64 00 00 00 FF 7F', description: '区域2-有人' },
  { zoneId: 2, occupied: false, expected: '1C 02 64 01 00 00 FF 7E', description: '区域2-无人' },
  { zoneId: 1, occupied: true, expected: '1C 01 64 00 00 00 FF 80', description: '区域1-有人' },
  { zoneId: 255, occupied: true, expected: '1C FF 64 00 00 00 FF 82', description: '区域255-有人' },
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const frame = encoder.encode(testCase.zoneId, testCase.occupied);
  const hex = Array.from(frame).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  
  const isValid = encoder.verify(frame);
  const matches = hex === testCase.expected;
  
  console.log(`\n测试: ${testCase.description}`);
  console.log(`  区域号: ${testCase.zoneId}, 状态: ${testCase.occupied ? '有人' : '无人'}`);
  console.log(`  生成帧: ${hex}`);
  console.log(`  期望帧: ${testCase.expected}`);
  console.log(`  校验和验证: ${isValid ? '✓' : '✗'}`);
  console.log(`  格式匹配: ${matches ? '✓' : '✗'}`);
  
  if (isValid && matches) {
    console.log(`  结果: ✓ 通过`);
    passed++;
  } else {
    console.log(`  结果: ✗ 失败`);
    failed++;
  }
  
  // 手动验证校验和
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += frame[i];
  }
  const calculatedChecksum = (0x100 - (sum % 0x100)) % 0x100;
  console.log(`  校验和计算: sum=${sum.toString(16).toUpperCase()}, checksum=${calculatedChecksum.toString(16).toUpperCase()}`);
}

console.log('\n' + '='.repeat(50));
console.log(`总计: ${testCases.length} 个测试`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);

if (failed === 0) {
  console.log('\n✓ 所有测试通过！');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败！');
  process.exit(1);
}

