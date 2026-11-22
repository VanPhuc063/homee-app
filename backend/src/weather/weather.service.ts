import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Bảng mã thời tiết WMO (chuẩn Open-Meteo dùng) rút gọn xuống các mã hay gặp — đủ cho hiển thị,
// không cần đầy đủ hơn 90 mã của chuẩn WMO.
const WMO_CONDITIONS: Record<number, string> = {
  0: 'Trời quang',
  1: 'Ít mây',
  2: 'Có mây',
  3: 'Nhiều mây',
  45: 'Sương mù',
  48: 'Sương mù đóng băng',
  51: 'Mưa phùn nhẹ',
  53: 'Mưa phùn',
  55: 'Mưa phùn dày',
  61: 'Mưa nhẹ',
  63: 'Mưa vừa',
  65: 'Mưa to',
  80: 'Mưa rào nhẹ',
  81: 'Mưa rào',
  82: 'Mưa rào lớn',
  95: 'Giông',
  96: 'Giông kèm mưa đá',
};

function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isoDate(date: Date): string {
  return toDateOnly(date).toISOString().slice(0, 10);
}

/**
 * Lấy thời tiết theo ngày cho 1 dự án — dùng Open-Meteo (miễn phí, không cần API key). Geocode
 * Project.address 1 lần (không cache toạ độ riêng vì address hiếm khi đổi và geocode rất nhanh),
 * cache KẾT QUẢ THỜI TIẾT theo (projectId, date) vào bảng DailyWeather để không gọi API lặp lại.
 * Thất bại (không geocode được, lỗi mạng...) trả về null thay vì ném lỗi — thời tiết là thông tin
 * bổ sung, không được làm hỏng cả màn Nhật ký ngày nếu API bên ngoài sập.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(private prisma: PrismaService) {}

  private async geocode(address: string): Promise<{ lat: number; lon: number } | null> {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        address,
      )}&count=1&language=vi`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: { latitude: number; longitude: number }[] };
      const first = data.results?.[0];
      return first ? { lat: first.latitude, lon: first.longitude } : null;
    } catch (e) {
      this.logger.warn(`Geocode thất bại cho địa chỉ "${address}": ${(e as Error).message}`);
      return null;
    }
  }

  async getForDate(
    project: { id: string; address: string | null },
    date: Date,
  ): Promise<{ tempC: number; condition: string; rainWindow: string | null } | null> {
    const day = toDateOnly(date);
    const cached = await this.prisma.dailyWeather.findUnique({
      where: { projectId_date: { projectId: project.id, date: day } },
    });
    if (cached) return cached;

    if (!project.address) return null;
    const coords = await this.geocode(project.address);
    if (!coords) return null;

    try {
      const dateStr = isoDate(day);
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&hourly=precipitation,weathercode&daily=temperature_2m_max,weathercode` +
        `&timezone=Asia%2FHo_Chi_Minh&start_date=${dateStr}&end_date=${dateStr}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        daily?: { temperature_2m_max: number[]; weathercode: number[] };
        hourly?: { time: string[]; precipitation: number[] };
      };
      const tempC = data.daily?.temperature_2m_max?.[0];
      const weatherCode = data.daily?.weathercode?.[0];
      if (tempC == null || weatherCode == null) return null;

      const rainHours = (data.hourly?.precipitation ?? [])
        .map((mm, i) => ({ mm, hour: i }))
        .filter((h) => h.mm > 0.1);
      const rainWindow =
        rainHours.length > 0
          ? `${rainHours[0].hour}h-${rainHours[rainHours.length - 1].hour + 1}h`
          : null;

      const weather = {
        projectId: project.id,
        date: day,
        tempC,
        condition: WMO_CONDITIONS[weatherCode] ?? 'Không rõ',
        rainWindow,
      };
      return this.prisma.dailyWeather.upsert({
        where: { projectId_date: { projectId: project.id, date: day } },
        create: weather,
        update: weather,
      });
    } catch (e) {
      this.logger.warn(`Lấy thời tiết thất bại cho dự án ${project.id}: ${(e as Error).message}`);
      return null;
    }
  }
}
