import {FilterOptionDef, IDoesFilterPassParams, SerializedFilter} from "../interfaces/iFilter";
import {
    ComparableBaseFilter,
    BaseFilter,
    IScalarFilterParams,
    FilterConditionType,
    IComparableFilterParams
} from "./baseFilter";
import { QuerySelector } from "../widgets/componentAnnotations";
import { _ } from "../utils";

export interface SerializedTextFilter extends SerializedFilter {
    filter: string;
    type: string;
}

export interface TextComparator {
    (filter: string, gridValue: any, filterText: string): boolean;
}

export interface TextFormatter {
    (from: string): string;
}

export interface INumberFilterParams extends IScalarFilterParams {
    debounceMs?: number;
}

export interface ITextFilterParams extends IComparableFilterParams {
    textCustomComparator?: TextComparator;
    debounceMs?: number;
    caseSensitive?: boolean;
}

export class TextFilter extends ComparableBaseFilter <string, ITextFilterParams, SerializedTextFilter> {
    @QuerySelector('#filterText')
    private eFilterTextField: HTMLInputElement;

    @QuerySelector('#filterConditionText')
    private eFilterConditionTextField: HTMLInputElement;

    private filterText: string;
    private filterConditionText: string;

    private comparator: TextComparator;
    private formatter: TextFormatter;
    static DEFAULT_FORMATTER: TextFormatter = (from: string) => {
        return from;
    };

    static DEFAULT_LOWERCASE_FORMATTER: TextFormatter = (from: string) => {
        if (from == null) { return null; }
        return from.toString().toLowerCase();
    };

    static DEFAULT_COMPARATOR: TextComparator = (filter: string, value: any, filterText: string) => {
        switch (filter) {
        case TextFilter.CONTAINS:
            return value.indexOf(filterText) >= 0;
        case TextFilter.NOT_CONTAINS:
            return value.indexOf(filterText) === -1;
        case TextFilter.EQUALS:
            return value === filterText;
        case TextFilter.NOT_EQUAL:
            return value != filterText;
        case TextFilter.STARTS_WITH:
            return value.indexOf(filterText) === 0;
        case TextFilter.ENDS_WITH:
            const index = value.lastIndexOf(filterText);
            return index >= 0 && index === (value.length - filterText.length);
        default:
            // should never happen
            console.warn('invalid filter type ' + filter);
            return false;
        }
    };

    public getDefaultType(): string {
        return BaseFilter.CONTAINS;
    }

    public customInit(): void {
        this.comparator = this.filterParams.textCustomComparator ? this.filterParams.textCustomComparator : TextFilter.DEFAULT_COMPARATOR;
        this.formatter =
            this.filterParams.textFormatter ? this.filterParams.textFormatter :
            this.filterParams.caseSensitive == true ? TextFilter.DEFAULT_FORMATTER :
                TextFilter.DEFAULT_LOWERCASE_FORMATTER;
        super.customInit();
    }

    modelFromFloatingFilter(from: string): SerializedTextFilter {

        const filterOptionType = (typeof this.selectedFilter === 'string') ?
            this.selectedFilter : this.selectedFilter.displayKey;

        return {
            type: filterOptionType,
            filter: from,
            filterType: 'text'
        };
    }

    public getApplicableFilterTypes(): string[] {
        return [BaseFilter.EQUALS, BaseFilter.NOT_EQUAL, BaseFilter.STARTS_WITH, BaseFilter.ENDS_WITH,
            BaseFilter.CONTAINS, BaseFilter.NOT_CONTAINS];
    }

    public bodyTemplate(type:FilterConditionType): string {
        const translate = this.translate.bind(this);
        const fieldId = type == FilterConditionType.MAIN ? "filterText" : "filterConditionText";
        return `<div class="ag-filter-body">
            <div class="ag-input-text-wrapper">
                <input class="ag-filter-filter" id=${fieldId} type="text" placeholder="${translate('filterOoo', 'Filter...')}"/>
            </div>
        </div>`;
    }

    public initialiseFilterBodyUi(type:FilterConditionType) {
        super.initialiseFilterBodyUi(type);
        this.addFilterChangedListener(type);
        this.setFilter(this.filterConditionText, FilterConditionType.CONDITION);
        this.setFilterType(this.selectedFilterCondition, FilterConditionType.CONDITION);
    }

    private addFilterChangedListener(type:FilterConditionType) {
        const eElement = type === FilterConditionType.MAIN ? this.eFilterTextField : this.eFilterConditionTextField;
        const debounceMs = this.getDebounceMs(this.filterParams);
        const toDebounce: () => void = _.debounce(() => this.onFilterTextFieldChanged(type), debounceMs);
        this.addDestroyableEventListener(eElement, 'input', toDebounce);
    }

    public refreshFilterBodyUi(type:FilterConditionType) {
        if (this.eFilterConditionTextField) {
            this.addFilterChangedListener(FilterConditionType.CONDITION);
        }
    }

    public afterGuiAttached() {
        this.eFilterTextField.focus();
    }

    public filterValues(type:FilterConditionType): string {
        return type === FilterConditionType.MAIN ? this.filterText : this.filterConditionText;
    }

    public individualFilterPasses(params: IDoesFilterPassParams, type:FilterConditionType): boolean {

        const filterText: string = (type == FilterConditionType.MAIN) ?
            this.filterText : this.filterConditionText;

        const selectedFilterOption: string | FilterOptionDef = (type == FilterConditionType.MAIN) ?
            this.selectedFilter : this.selectedFilterCondition;

        if (!filterText) {
            return type === FilterConditionType.MAIN ? true : this.conditionValue === 'AND';
        } else {
            return this.checkIndividualFilter (params, type, selectedFilterOption, filterText);
        }
    }

    private checkIndividualFilter(params: IDoesFilterPassParams, type:FilterConditionType, selectedFilterOption: string | FilterOptionDef, filterText: string) {
        const cellValue = this.filterParams.valueGetter(params.node);

        const filterTextFormatted = this.formatter(filterText);

        if (typeof selectedFilterOption !== 'string') {
            const filterOptionDef = selectedFilterOption as FilterOptionDef;
            if (type === FilterConditionType.MAIN) {
                // value could be null so only invoking formatter if custom filter option
                const valueFormatted: string = this.formatter(cellValue);
                return filterOptionDef.test(filterTextFormatted, valueFormatted);
            }
            if (type === FilterConditionType.CONDITION) {
                // value could be null so only invoking formatter if custom filter option
                const valueFormatted: string = this.formatter(cellValue);
                return filterOptionDef.test(filterTextFormatted, valueFormatted);
            }
        }

        if (cellValue == null || cellValue === undefined) {
            return selectedFilterOption === BaseFilter.NOT_EQUAL || selectedFilterOption === BaseFilter.NOT_CONTAINS;
        }

        // values supplied to formatter should not be null (for backwards compatibility)
        const valueFormatted: string = this.formatter(cellValue);

        return this.comparator (selectedFilterOption as string, valueFormatted, filterTextFormatted);
    }

    private onFilterTextFieldChanged(type:FilterConditionType) {
        const value:string = type === FilterConditionType.MAIN ? this.eFilterTextField.value : this.eFilterConditionTextField.value;
        const current:string = type === FilterConditionType.MAIN ? this.filterText : this.filterConditionText;

        let filterText = _.makeNull(value);
        if (filterText && filterText.trim() === '') {
            filterText = null;
        }

        if (current !== filterText) {
            const newLowerCase =
                filterText && this.filterParams.caseSensitive != true ? filterText.toLowerCase() :
                filterText;
            const previousLowerCase = current && this.filterParams.caseSensitive != true  ? current.toLowerCase() :
                current;

            if (type === FilterConditionType.MAIN) {
                this.filterText = this.formatter(filterText);

            } else {
                this.filterConditionText = this.formatter(filterText);
            }
            if (previousLowerCase !== newLowerCase) {
                this.onFilterChanged();
            }
        }
    }

    public setFilter(filter: string, type:FilterConditionType): void {
        filter = _.makeNull(filter);

        if (type === FilterConditionType.MAIN) {
            if (filter) {
                this.filterText = this.formatter(filter);

                if (!this.eFilterTextField) { return; }
                this.eFilterTextField.value = filter;
            } else {
                this.filterText = null;

                if (!this.eFilterTextField) { return; }
                this.eFilterTextField.value = null;
            }
        } else {
            if (filter) {
                this.filterConditionText = this.formatter(filter);

                if (!this.eFilterConditionTextField) { return; }
                this.eFilterConditionTextField.value = filter;
            } else {
                this.filterConditionText = null;

                if (!this.eFilterConditionTextField) { return; }
                this.eFilterConditionTextField.value = null;
            }
        }
    }

    public getFilter(): string {
        return this.filterText;
    }

    public resetState(): void {
        this.setFilter(null, FilterConditionType.MAIN);
        this.setFilterType(this.defaultFilter, FilterConditionType.MAIN);

        this.setFilter(null, FilterConditionType.CONDITION);
        this.setFilterType(this.defaultFilter, FilterConditionType.CONDITION);
    }

    public serialize(type:FilterConditionType): SerializedTextFilter {
        const filterOptionKey = this.getSelectedFilterOptionKey(type);
        const filterText = type === FilterConditionType.MAIN ? this.filterText : this.filterConditionText;

        return {
            type: filterOptionKey,
            filter: filterText,
            filterType: 'text'
        };
    }

    public parse(model: SerializedTextFilter, type:FilterConditionType): void {
        this.setFilterType(model.type, type);
        this.setFilter(model.filter, type);
    }

    public setType(filterType: string, type:FilterConditionType): void {
        this.setFilterType(filterType, type);
    }
}