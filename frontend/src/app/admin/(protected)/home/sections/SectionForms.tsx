"use client";

// 首頁 7 區段的「友善欄位」編輯表單，依前台顯示順序：
//   輪播圖 → 數據列 → 永續節能 → 最新消息 → 產品系列 → 產品特色 → 追蹤我們。
// 每個區段以 SectionForm 包裝（含隱藏 key / 送出 / 狀態），內部用 primitives 組欄位。
// 所有現值由 page.tsx 以 service_role 讀出後 prefill（缺漏退回 HOME_DEFAULTS）。
import { HOME_KEYS } from "@/lib/data/home-keys";
import type {
  HomeCarousel,
  HomeStats,
  HomeTech,
  HomeNews,
  HomeProducts,
  HomeFeatures,
  HomeSocial,
} from "@/lib/data/home";
import {
  TECH_ICON_OPTIONS,
  FEATURE_ICON_OPTIONS,
} from "@/lib/admin/home-sections";
import {
  Field,
  TextareaField,
  IconSelect,
  ImageField,
  RepeatableList,
  SectionForm,
} from "./primitives";

// 1. 輪播圖 ----------------------------------------------------------------
export function CarouselForm({ value }: { value: HomeCarousel }) {
  return (
    <SectionForm
      settingKey={HOME_KEYS.carousel}
      heading="輪播圖"
      description="首頁最上方的痛點輪播。每張投影片可設圖片與文案；編號（01、02…）由系統依順序自動產生。"
    >
      <RepeatableList
        prefix="slides"
        label="投影片"
        addLabel="新增投影片"
        initialCount={value.slides.length}
        renderRow={(i) => {
          const s = value.slides[i];
          return (
            <div className="flex flex-col gap-3">
              <ImageField
                name={`slides[${i}].image_url`}
                label="圖片"
                folder="home"
                initialUrl={s?.image_url ?? ""}
              />
              <Field
                name={`slides[${i}].alt`}
                label="替代文字（alt，供無障礙與 SEO）"
                defaultValue={s?.alt}
              />
              <Field
                name={`slides[${i}].category`}
                label="分類標籤"
                defaultValue={s?.category}
                placeholder="例：電費過高"
              />
              <Field
                name={`slides[${i}].headline`}
                label="主標"
                defaultValue={s?.headline}
              />
              <Field
                name={`slides[${i}].tagline`}
                label="副標"
                defaultValue={s?.tagline}
              />
            </div>
          );
        }}
      />
    </SectionForm>
  );
}

// 2. 數據列 ----------------------------------------------------------------
export function StatsForm({ value }: { value: HomeStats }) {
  return (
    <SectionForm
      settingKey={HOME_KEYS.stats}
      heading="數據列"
      description="輪播下方的一排關鍵數據。"
    >
      <RepeatableList
        prefix="items"
        label="數據項目"
        addLabel="新增數據"
        initialCount={value.items.length}
        renderRow={(i) => {
          const it = value.items[i];
          return (
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="sm:w-1/3">
                <Field
                  name={`items[${i}].value`}
                  label="數字"
                  defaultValue={it?.value}
                  placeholder="例：35%"
                />
              </div>
              <div className="sm:flex-1">
                <Field
                  name={`items[${i}].label`}
                  label="說明"
                  defaultValue={it?.label}
                  placeholder="例：平均節能效益"
                />
              </div>
            </div>
          );
        }}
      />
    </SectionForm>
  );
}

// 3. 永續節能 --------------------------------------------------------------
export function TechForm({ value }: { value: HomeTech }) {
  return (
    <SectionForm
      settingKey={HOME_KEYS.tech}
      heading="永續節能"
      description="左側為固定的碳排儀表板示意圖；右側文案與特色清單可編輯。"
    >
      <Field name="eyebrow" label="上標（小字）" defaultValue={value.eyebrow} />
      <Field name="title" label="標題" defaultValue={value.title} />
      <TextareaField
        name="description"
        label="描述"
        defaultValue={value.description}
        rows={3}
      />
      <RepeatableList
        prefix="features"
        label="特色清單"
        addLabel="新增特色"
        initialCount={value.features.length}
        renderRow={(i) => {
          const f = value.features[i];
          return (
            <div className="flex flex-col gap-3">
              <IconSelect
                name={`features[${i}].icon`}
                label="圖示"
                options={TECH_ICON_OPTIONS}
                defaultValue={f?.icon}
              />
              <Field
                name={`features[${i}].title`}
                label="標題"
                defaultValue={f?.title}
              />
              <TextareaField
                name={`features[${i}].description`}
                label="說明"
                defaultValue={f?.description}
              />
            </div>
          );
        }}
      />
    </SectionForm>
  );
}

// 4. 最新消息 --------------------------------------------------------------
export function NewsForm({ value }: { value: HomeNews }) {
  return (
    <SectionForm
      settingKey={HOME_KEYS.news}
      heading="最新消息"
      description="只需設定區塊上標與標題；下方卡片由系統自動取最新 3 篇文章，不需在此編輯。"
    >
      <Field name="eyebrow" label="上標（小字）" defaultValue={value.eyebrow} />
      <Field name="title" label="標題" defaultValue={value.title} />
    </SectionForm>
  );
}

// 5. 產品系列 --------------------------------------------------------------
export function ProductsForm({ value }: { value: HomeProducts }) {
  return (
    <SectionForm
      settingKey={HOME_KEYS.products}
      heading="產品系列"
      description="產品分類卡片區塊。"
    >
      <Field name="eyebrow" label="上標（小字）" defaultValue={value.eyebrow} />
      <Field name="title" label="標題" defaultValue={value.title} />
      <TextareaField
        name="description"
        label="描述"
        defaultValue={value.description}
        rows={3}
      />
      <RepeatableList
        prefix="categories"
        label="產品分類"
        addLabel="新增分類"
        initialCount={value.categories.length}
        renderRow={(i) => {
          const c = value.categories[i];
          return (
            <div className="flex flex-col gap-3">
              <ImageField
                name={`categories[${i}].image_url`}
                label="圖片"
                folder="home"
                initialUrl={c?.image_url ?? ""}
              />
              <Field
                name={`categories[${i}].name`}
                label="名稱"
                defaultValue={c?.name}
              />
              <TextareaField
                name={`categories[${i}].desc`}
                label="說明"
                defaultValue={c?.desc}
              />
            </div>
          );
        }}
      />
    </SectionForm>
  );
}

// 6. 產品特色 --------------------------------------------------------------
export function FeaturesForm({ value }: { value: HomeFeatures }) {
  return (
    <SectionForm
      settingKey={HOME_KEYS.features}
      heading="產品特色"
      description="產品共通特色卡片區塊。"
    >
      <Field name="eyebrow" label="上標（小字）" defaultValue={value.eyebrow} />
      <Field name="title" label="標題" defaultValue={value.title} />
      <RepeatableList
        prefix="features"
        label="特色清單"
        addLabel="新增特色"
        initialCount={value.features.length}
        renderRow={(i) => {
          const f = value.features[i];
          return (
            <div className="flex flex-col gap-3">
              <IconSelect
                name={`features[${i}].icon`}
                label="圖示"
                options={FEATURE_ICON_OPTIONS}
                defaultValue={f?.icon}
              />
              <Field
                name={`features[${i}].title`}
                label="標題"
                defaultValue={f?.title}
              />
              <TextareaField
                name={`features[${i}].desc`}
                label="說明"
                defaultValue={f?.desc}
              />
            </div>
          );
        }}
      />
    </SectionForm>
  );
}

// 7. 追蹤我們 --------------------------------------------------------------
export function SocialForm({ value }: { value: HomeSocial }) {
  return (
    <SectionForm
      settingKey={HOME_KEYS.social}
      heading="追蹤我們"
      description="各服務中心的社群與聯絡資訊卡片。"
    >
      <Field name="eyebrow" label="上標（小字）" defaultValue={value.eyebrow} />
      <Field name="title" label="標題" defaultValue={value.title} />
      <TextareaField
        name="description"
        label="描述"
        defaultValue={value.description}
        rows={3}
      />
      <RepeatableList
        prefix="companies"
        label="服務中心"
        addLabel="新增服務中心"
        initialCount={value.companies.length}
        renderRow={(i) => {
          const c = value.companies[i];
          return (
            <div className="flex flex-col gap-3">
              <Field
                name={`companies[${i}].region`}
                label="區域"
                defaultValue={c?.region}
                placeholder="例：北區服務中心"
              />
              <Field
                name={`companies[${i}].name`}
                label="名稱"
                defaultValue={c?.name}
              />
              <Field
                name={`companies[${i}].line`}
                label="LINE 連結"
                defaultValue={c?.line}
                placeholder="https://page.line.me/…"
              />
              <Field
                name={`companies[${i}].fb`}
                label="Facebook 連結"
                defaultValue={c?.fb}
                placeholder="https://www.facebook.com/…"
              />
            </div>
          );
        }}
      />
    </SectionForm>
  );
}
