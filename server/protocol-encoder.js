export class ProtocolEncoder {
  /**
   * 编码协议帧
   * @param {number} zoneId - 区域号 (1-255)
   * @param {boolean} occupied - true=有人, false=无人
   * @returns {Buffer} 8字节的二进制帧
   */
  encode(zoneId, occupied) {
    const frame = Buffer.alloc(8);
    
    // byte1: 固定 0x1C
    frame[0] = 0x1C;
    
    // byte2: 区域号 (1-255)
    frame[1] = Math.max(1, Math.min(255, zoneId));
    
    // byte3: 固定 0x64
    frame[2] = 0x64;
    
    // byte4: 状态 (0x00=有人, 0x01=无人)
    frame[3] = occupied ? 0x00 : 0x01;
    
    // byte5: 固定 0x00
    frame[4] = 0x00;
    
    // byte6: 固定 0x00
    frame[5] = 0x00;
    
    // byte7: 固定 0xFF
    frame[6] = 0xFF;
    
    // byte8: checksum
    frame[7] = this.calculateChecksum(frame);
    
    return frame;
  }

  /**
   * 计算校验和
   * checksum = (0x100 - (sum(byte1..byte7) mod 0x100)) mod 0x100
   */
  calculateChecksum(frame) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += frame[i];
    }
    return (0x100 - (sum % 0x100)) % 0x100;
  }

  /**
   * 验证帧的校验和
   */
  verify(frame) {
    if (frame.length !== 8) return false;
    const calculated = this.calculateChecksum(frame);
    return frame[7] === calculated;
  }
}

